import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';

import { TransactionContext } from '../../../../shared/application/transaction-runner';
import {
  ConfiguracionRecordatorioGuardada,
  ConfiguracionRecordatorioRepository,
  DatosConfiguracionRecordatorio,
} from '../../domain/configuracion-recordatorio.repository';
import { CanalRecordatorio } from '../../domain/recordatorio.entity';
import { exigirTransaccion, filasDe } from './soporte-sql';

/** Columnas con los nombres de `ConfiguracionRecordatorioGuardada`. */
const COLUMNAS = `
  "id",
  "tenant_id"         AS "tenantId",
  "usuario_id"        AS "usuarioId",
  "activo",
  "canal",
  "antelaciones_min"  AS "antelacionesMin",
  "telefono_contacto" AS "telefonoContacto",
  "correo_respuesta"  AS "correoRespuesta",
  "creado_en"         AS "creadoEn",
  "actualizado_en"    AS "actualizadoEn"`;

interface FilaConfiguracion {
  id: string;
  tenantId: string;
  usuarioId: string;
  activo: boolean;
  canal: CanalRecordatorio;
  antelacionesMin: (number | string)[];
  telefonoContacto: string | null;
  correoRespuesta: string | null;
  creadoEn: Date;
  actualizadoEn: Date;
}

/**
 * Adaptador TypeORM de `configuraciones_recordatorio` (ADR-13 §2–§3). Guarda
 * lo que recibe: las reglas las valida la entidad de dominio antes.
 */
@Injectable()
export class TypeOrmConfiguracionRecordatorioRepository extends ConfiguracionRecordatorioRepository {
  async obtener(
    tenantId: string,
    usuarioId: string,
    tx: TransactionContext,
  ): Promise<ConfiguracionRecordatorioGuardada | null> {
    const [fila] = filasDe<FilaConfiguracion>(
      await this.manager(tx, 'obtener').query(
        `SELECT ${COLUMNAS}
           FROM "configuraciones_recordatorio"
          WHERE "tenant_id" = $1
            AND "usuario_id" = $2`,
        [tenantId, usuarioId],
      ),
    );
    return fila ? aConfiguracion(fila) : null;
  }

  async guardar(
    datos: DatosConfiguracionRecordatorio,
    tx: TransactionContext,
  ): Promise<ConfiguracionRecordatorioGuardada> {
    // Upsert sobre la única (tenant_id, usuario_id). `creado_en` se conserva;
    // `actualizado_en` lo pone la base.
    const [fila] = filasDe<FilaConfiguracion>(
      await this.manager(tx, 'guardar').query(
        `INSERT INTO "configuraciones_recordatorio"
                ("tenant_id", "usuario_id", "activo", "canal",
                 "antelaciones_min", "telefono_contacto", "correo_respuesta")
         VALUES ($1, $2, $3, $4, $5::int[], $6, $7)
         ON CONFLICT ("tenant_id", "usuario_id") DO UPDATE
            SET "activo"            = EXCLUDED."activo",
                "canal"             = EXCLUDED."canal",
                "antelaciones_min"  = EXCLUDED."antelaciones_min",
                "telefono_contacto" = EXCLUDED."telefono_contacto",
                "correo_respuesta"  = EXCLUDED."correo_respuesta",
                "actualizado_en"    = now()
         RETURNING ${COLUMNAS}`,
        [
          datos.tenantId,
          datos.usuarioId,
          datos.activo,
          datos.canal,
          [...datos.antelacionesMin],
          datos.telefonoContacto,
          datos.correoRespuesta,
        ],
      ),
    );
    if (!fila) {
      // Un upsert con RETURNING siempre devuelve la fila.
      throw new Error('ConfiguracionRecordatorioRepository.guardar: sin fila');
    }
    return aConfiguracion(fila);
  }

  private manager(tx: TransactionContext, operacion: string): EntityManager {
    return exigirTransaccion(
      tx,
      'ConfiguracionRecordatorioRepository',
      operacion,
    );
  }
}

function aConfiguracion(
  fila: FilaConfiguracion,
): ConfiguracionRecordatorioGuardada {
  return {
    id: fila.id,
    tenantId: fila.tenantId,
    usuarioId: fila.usuarioId,
    activo: fila.activo,
    canal: fila.canal,
    antelacionesMin: fila.antelacionesMin.map(Number),
    telefonoContacto: fila.telefonoContacto,
    correoRespuesta: fila.correoRespuesta,
    creadoEn: fila.creadoEn,
    actualizadoEn: fila.actualizadoEn,
  };
}
