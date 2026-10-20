import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * US-07.01 (H6, plan `context/US/07.01-registro-hechos.md`): índice del job
 * G1 (cierre de las citas `pendiente` a las que nadie llegó, DT-11).
 *
 * - `idx_cita_pendiente_inicio`: PARCIAL sobre `inicio` de las citas
 *   `pendiente`. El job barre TODOS los tenants (ADR-12 §6) y solo mira esas
 *   citas por rango de `inicio`. Para que el planificador lo use, la consulta
 *   (`SqlCandidatasGhosting`) escribe el predicado igual:
 *   `c."estado" = 'pendiente'`, sin `::text`.
 * - Las otras dos condiciones de G1 usan índices que ya existen:
 *   `idx_recordatorio_cita` y `uq_solicitud_reagendamiento_recibida`.
 * - Sin `CONCURRENTLY`: va dentro de la transacción del lote
 *   (`migrationsTransactionMode = 'all'`). Con el volumen del piloto bloquea
 *   las escrituras de `citas` unos milisegundos.
 *
 * `down`: borra el índice (sin pérdida de datos).
 */
export class AddIndiceCierreGhostingACitas1750000018000 implements MigrationInterface {
  name = 'AddIndiceCierreGhostingACitas1750000018000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX "idx_cita_pendiente_inicio"
        ON "citas" ("inicio")
        WHERE "estado" = 'pendiente'
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX "public"."idx_cita_pendiente_inicio"
    `);
  }
}
