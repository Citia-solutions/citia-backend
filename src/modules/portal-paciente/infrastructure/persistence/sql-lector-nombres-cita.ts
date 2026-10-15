import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';

import { TransactionContext } from '../../../../shared/application/transaction-runner';
import {
  LectorNombresCita,
  NombresCita,
} from '../../domain/lector-nombres-cita';

interface FilaNombres {
  profesional: string;
  organizacion: string;
}

/**
 * Lector SQL de SOLO LECTURA sobre `usuarios` y `tenants` (mismo enfoque que
 * `SqlLectorCitas` de `recordatorio`). Una consulta; nunca escribe ni
 * bloquea esas tablas.
 *
 * Coste aceptado: depende del ESQUEMA de `usuarios.nombre_completo` y
 * `tenants.nombre`. Si cambian, este archivo cambia con ellos.
 */
@Injectable()
export class SqlLectorNombresCita extends LectorNombresCita {
  async leer(
    usuarioId: string,
    tenantId: string,
    tx: TransactionContext,
  ): Promise<NombresCita | null> {
    if (!tx) {
      throw new Error('LectorNombresCita.leer requiere una transacción');
    }
    // El JOIN exige el mismo tenant: un usuario de otra organización no
    // aparece.
    const filas: unknown = await (tx as EntityManager).query(
      `SELECT u."nombre_completo" AS "profesional",
              t."nombre"          AS "organizacion"
         FROM "usuarios" u
         JOIN "tenants"  t ON t."id" = u."tenant_id"
        WHERE u."id" = $1
          AND u."tenant_id" = $2`,
      [usuarioId, tenantId],
    );
    const [fila] = Array.isArray(filas) ? (filas as FilaNombres[]) : [];
    return fila
      ? { profesional: fila.profesional, organizacion: fila.organizacion }
      : null;
  }
}
