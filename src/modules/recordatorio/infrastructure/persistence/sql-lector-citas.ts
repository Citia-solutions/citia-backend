import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';

import { TransactionContext } from '../../../../shared/application/transaction-runner';
import { ESTADOS_VIGENTES } from '../../../cita/domain/cita.entity';
import {
  CitaLeida,
  ConsultaCitasSinRecordatorio,
  DatosEnvioCita,
  LectorCitas,
} from '../../domain/lector-citas';
import {
  esUuid,
  exigirTransaccion,
  filasDe,
  validarPeriodo,
} from './soporte-sql';

/** Estados vigentes como texto (ADR-04): el filtro compara `estado::text`. */
const VIGENTES: readonly string[] = [...ESTADOS_VIGENTES];

/**
 * Columnas de la cita con los nombres de `CitaLeida` (sin `vigente`, que se
 * deriva). `estado::text` para no depender del NOMBRE del tipo enum, que no
 * es el mismo en la migración (`enum_citas_estado`) que en un esquema creado
 * con `synchronize` (tests).
 */
const COLUMNAS_CITA = `
  c."id",
  c."tenant_id"   AS "tenantId",
  c."usuario_id"  AS "usuarioId",
  c."paciente_id" AS "pacienteId",
  c."inicio",
  c."estado"::text AS "estado"`;

interface FilaCita {
  id: string;
  tenantId: string;
  usuarioId: string;
  pacienteId: string;
  inicio: Date;
  estado: string;
}

interface FilaDatosEnvio extends FilaCita {
  pacienteCorreo: string | null;
  pacienteConsentimiento: boolean;
  profesionalNombre: string;
  organizacionNombre: string;
}

/**
 * Lector SQL de SOLO LECTURA sobre `citas`, `pacientes`, `usuarios` y
 * `tenants` (ADR-13 §1). Nunca escribe en esas tablas ni las bloquea.
 *
 * Coste aceptado por ADR-13: depende del ESQUEMA de esas tablas. Si cambia
 * una columna que se lee aquí, este archivo cambia con ella.
 *
 * Cada método es UNA consulta (sin N+1): el envío trae cita, paciente,
 * profesional y organización con JOIN; el respaldo cruza `citas ×
 * recordatorios` con `NOT EXISTS`.
 */
@Injectable()
export class SqlLectorCitas extends LectorCitas {
  async obtenerCita(
    citaId: string,
    tenantId: string,
    tx: TransactionContext,
  ): Promise<CitaLeida | null> {
    const manager = this.manager(tx, 'obtenerCita');
    if (!esUuid(citaId)) return null;
    const [fila] = filasDe<FilaCita>(
      await manager.query(
        `SELECT ${COLUMNAS_CITA}
           FROM "citas" c
          WHERE c."id" = $1
            AND c."tenant_id" = $2`,
        [citaId, tenantId],
      ),
    );
    return fila ? aCita(fila) : null;
  }

  async obtenerDatosEnvio(
    citaId: string,
    tenantId: string,
    tx: TransactionContext,
  ): Promise<DatosEnvioCita | null> {
    const manager = this.manager(tx, 'obtenerDatosEnvio');
    if (!esUuid(citaId)) return null;
    // Los JOIN exigen también el mismo tenant: un paciente o profesional de
    // otra organización nunca se mezcla con esta cita.
    const [fila] = filasDe<FilaDatosEnvio>(
      await manager.query(
        `SELECT ${COLUMNAS_CITA},
                NULLIF(btrim(p."correo"), '') AS "pacienteCorreo",
                p."consentimiento"            AS "pacienteConsentimiento",
                u."nombre_completo"           AS "profesionalNombre",
                t."nombre"                    AS "organizacionNombre"
           FROM "citas" c
           JOIN "pacientes" p ON p."id" = c."paciente_id" AND p."tenant_id" = c."tenant_id"
           JOIN "usuarios"  u ON u."id" = c."usuario_id"  AND u."tenant_id" = c."tenant_id"
           JOIN "tenants"   t ON t."id" = c."tenant_id"
          WHERE c."id" = $1
            AND c."tenant_id" = $2`,
        [citaId, tenantId],
      ),
    );
    if (!fila) return null;
    return {
      cita: aCita(fila),
      paciente: {
        correo: fila.pacienteCorreo,
        consentimiento: fila.pacienteConsentimiento === true,
      },
      profesional: { nombreCompleto: fila.profesionalNombre },
      organizacion: { nombre: fila.organizacionNombre },
    };
  }

  async listarVigentesDeProfesionalDesde(
    tenantId: string,
    usuarioId: string,
    desde: Date,
    tx: TransactionContext,
  ): Promise<CitaLeida[]> {
    const manager = this.manager(tx, 'listarVigentesDeProfesionalDesde');
    // Usa idx_cita_tenant_usuario_inicio (tenant_id, usuario_id, inicio).
    const filas = filasDe<FilaCita>(
      await manager.query(
        `SELECT ${COLUMNAS_CITA}
           FROM "citas" c
          WHERE c."tenant_id" = $1
            AND c."usuario_id" = $2
            AND c."inicio" >= $3
            AND c."estado"::text = ANY($4::text[])
          ORDER BY c."inicio", c."id"`,
        [tenantId, usuarioId, desde, [...VIGENTES]],
      ),
    );
    return filas.map(aCita);
  }

  // BARRIDO GLOBAL (ADR-12 §6)
  async listarVigentesSinRecordatorio(
    consulta: ConsultaCitasSinRecordatorio,
    tx: TransactionContext,
  ): Promise<CitaLeida[]> {
    const manager = this.manager(tx, 'listarVigentesSinRecordatorio');
    validarPeriodo(
      consulta.desde,
      consulta.hasta,
      'listarVigentesSinRecordatorio',
    );
    if (!Number.isInteger(consulta.limite) || consulta.limite <= 0) {
      throw new RangeError(
        `listarVigentesSinRecordatorio: limite debe ser un entero > 0 (recibido ${consulta.limite})`,
      );
    }

    const parametros: unknown[] = [
      [...VIGENTES],
      consulta.desde,
      consulta.hasta,
      consulta.limite,
    ];
    let cursor = '';
    if (consulta.despuesDe) {
      parametros.push(consulta.despuesDe.inicio, consulta.despuesDe.id);
      cursor = `AND (c."inicio", c."id") > ($5::timestamptz, $6::uuid)`;
    }

    // Sin filtro de tenant a propósito: el respaldo cubre a toda la
    // plataforma. "Sin recordatorio para su inicio" = ninguna fila, de ningún
    // estado, con `inicio_cita` = el inicio ACTUAL de la cita (ADR-13 §6).
    const filas = filasDe<FilaCita>(
      await manager.query(
        `SELECT ${COLUMNAS_CITA}
           FROM "citas" c
          WHERE c."estado"::text = ANY($1::text[])
            AND c."inicio" >= $2
            AND c."inicio" < $3
            AND NOT EXISTS (
                  SELECT 1
                    FROM "recordatorios" r
                   WHERE r."cita_id" = c."id"
                     AND r."inicio_cita" = c."inicio"
                )
            ${cursor}
          ORDER BY c."inicio", c."id"
          LIMIT $4`,
        parametros,
      ),
    );
    return filas.map(aCita);
  }

  private manager(tx: TransactionContext, operacion: string): EntityManager {
    return exigirTransaccion(tx, 'LectorCitas', operacion);
  }
}

function aCita(fila: FilaCita): CitaLeida {
  return {
    id: fila.id,
    tenantId: fila.tenantId,
    usuarioId: fila.usuarioId,
    pacienteId: fila.pacienteId,
    inicio: fila.inicio,
    estado: fila.estado,
    vigente: VIGENTES.includes(fila.estado),
  };
}
