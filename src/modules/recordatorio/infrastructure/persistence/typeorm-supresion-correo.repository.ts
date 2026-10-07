import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';

import { TransactionContext } from '../../../../shared/application/transaction-runner';
import { FORMATO_HASH_CORREO } from '../../domain/hash-correo';
import {
  NuevaSupresion,
  SupresionCorreoRepository,
} from '../../domain/supresion-correo.repository';
import { esUuid, exigirTransaccion, filasDe } from './soporte-sql';

/**
 * Adaptador TypeORM de `supresiones_correo` (ADR-13 §2). Global por diseño:
 * se consulta por clave (`correo_hash`), sin tenant.
 *
 * Nunca recibe la dirección: rechaza cualquier valor que no sea un SHA-256
 * hex ANTES de tocar la base (y la base lo vuelve a impedir con su CHECK).
 * El error no repite el valor recibido, por si fuera un correo en claro.
 */
@Injectable()
export class TypeOrmSupresionCorreoRepository extends SupresionCorreoRepository {
  async existe(correoHash: string, tx: TransactionContext): Promise<boolean> {
    const manager = this.manager(tx, 'existe');
    exigirHash(correoHash, 'existe');
    const [fila] = filasDe<{ existe: boolean }>(
      await manager.query(
        `SELECT EXISTS (
                  SELECT 1 FROM "supresiones_correo" WHERE "correo_hash" = $1
                ) AS "existe"`,
        [correoHash],
      ),
    );
    return fila?.existe === true;
  }

  async agregar(
    supresion: NuevaSupresion,
    tx: TransactionContext,
  ): Promise<boolean> {
    const manager = this.manager(tx, 'agregar');
    exigirHash(supresion.correoHash, 'agregar');
    if (
      supresion.origenRecordatorioId !== null &&
      !esUuid(supresion.origenRecordatorioId)
    ) {
      throw new Error(
        'SupresionCorreoRepository.agregar: origenRecordatorioId no es un UUID',
      );
    }
    // Idempotente: si ya estaba, gana el primer motivo y no se toca.
    const filas = filasDe<{ correoHash: string }>(
      await manager.query(
        `INSERT INTO "supresiones_correo"
                ("correo_hash", "motivo", "origen_recordatorio_id")
         VALUES ($1, $2, $3)
         ON CONFLICT ("correo_hash") DO NOTHING
         RETURNING "correo_hash" AS "correoHash"`,
        [
          supresion.correoHash,
          supresion.motivo,
          supresion.origenRecordatorioId,
        ],
      ),
    );
    return filas.length > 0;
  }

  private manager(tx: TransactionContext, operacion: string): EntityManager {
    return exigirTransaccion(tx, 'SupresionCorreoRepository', operacion);
  }
}

function exigirHash(correoHash: string, operacion: string): void {
  if (!FORMATO_HASH_CORREO.test(correoHash)) {
    throw new Error(
      `SupresionCorreoRepository.${operacion}: se esperaba el hash SHA-256 del correo (calcularHashCorreo), no otro valor`,
    );
  }
}
