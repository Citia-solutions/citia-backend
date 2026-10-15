import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fase 3 (US-02.07), contrato §2.2: "pedir otra hora" desde el enlace del
 * paciente llega a la bandeja como una SolicitudCita de tipo `reagendamiento`.
 *
 * - `tipo` (`nueva` | `reagendamiento`), NOT NULL DEFAULT `nueva`: las filas
 *   existentes quedan como `nueva` (en Postgres 11+ es solo metadatos).
 * - `cita_origen_id`: la cita que se quiere mover. Sin FK, igual que `cita_id`
 *   (ADR-09): el esquema de `solicitud` no referencia a `citas`.
 * - `enlace_id`: con qué enlace se pidió (`enlaces_cita.id`). Sin FK.
 * - `rut` y `correo` pasan a NULL: la solicitud de reagendamiento copia los
 *   datos de la ficha del paciente, y el alta manual admite pacientes sin RUT
 *   (y fichas antiguas sin correo).
 *
 * Restricciones:
 * - `CHK_solicitudes_cita_reagendamiento_origen` (contrato): `reagendamiento`
 *   ⇒ `cita_origen_id IS NOT NULL`.
 * - `CHK_solicitudes_cita_nueva_datos` (aditiva, fuera del contrato): una
 *   solicitud `nueva` sigue exigiendo `rut` y `correo`, como hasta ahora. Es lo
 *   que sostienen la regla anti-spam por RUT y el alta del paciente al aceptar.
 *
 * Índices:
 * - `uq_solicitud_reagendamiento_recibida`: única PARCIAL por cita de origen
 *   mientras está `recibida` (R5: una solicitud de otra hora abierta por cita).
 *   Solo compara contra `'recibida'`, que ya existía: no usa el valor
 *   `'descartada'` agregado en la migración anterior del mismo lote (ver
 *   1750000013000).
 * - `idx_solicitud_tenant_cita_origen`: `GET /solicitudes?citaOrigenId=`.
 *
 * ## `down`
 *
 * El esquema anterior no puede representar una solicitud de reagendamiento
 * (sin `tipo`, sin cita de origen y quizá sin RUT/correo). Si existe alguna,
 * el `down` FALLA a propósito en vez de borrarlas en silencio. Para revertir
 * igualmente, decide a mano, p. ej.:
 *   DELETE FROM solicitudes_cita WHERE tipo = 'reagendamiento';
 * Sin filas de reagendamiento, el CHECK de `nueva` garantiza que `rut` y
 * `correo` vuelven a NOT NULL sin error. ⚠️ El `down` elimina las columnas
 * `tipo`, `cita_origen_id` y `enlace_id` (cambio destructivo de esquema).
 */
export class AddReagendamientoASolicitudesCita1750000014000 implements MigrationInterface {
  name = 'AddReagendamientoASolicitudesCita1750000014000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "public"."enum_solicitudes_cita_tipo" AS ENUM(
        'nueva',
        'reagendamiento'
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "solicitudes_cita"
        ADD COLUMN "tipo" "public"."enum_solicitudes_cita_tipo" NOT NULL DEFAULT 'nueva',
        ADD COLUMN "cita_origen_id" UUID,
        ADD COLUMN "enlace_id" UUID
    `);

    await queryRunner.query(`
      ALTER TABLE "solicitudes_cita"
        ALTER COLUMN "rut" DROP NOT NULL,
        ALTER COLUMN "correo" DROP NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "solicitudes_cita"
        ADD CONSTRAINT "CHK_solicitudes_cita_reagendamiento_origen"
        CHECK ("tipo" <> 'reagendamiento' OR "cita_origen_id" IS NOT NULL)
    `);

    await queryRunner.query(`
      ALTER TABLE "solicitudes_cita"
        ADD CONSTRAINT "CHK_solicitudes_cita_nueva_datos"
        CHECK ("tipo" <> 'nueva' OR ("rut" IS NOT NULL AND "correo" IS NOT NULL))
    `);

    // R5: una solicitud de otra hora `recibida` por cita.
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_solicitud_reagendamiento_recibida"
        ON "solicitudes_cita" ("cita_origen_id")
        WHERE "tipo" = 'reagendamiento' AND "estado" = 'recibida'
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_solicitud_tenant_cita_origen"
        ON "solicitudes_cita" ("tenant_id", "cita_origen_id")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const [{ reagendamientos }] = (await queryRunner.query(`
      SELECT count(*)::int AS "reagendamientos"
        FROM "solicitudes_cita"
       WHERE "tipo" = 'reagendamiento'
    `)) as { reagendamientos: number }[];
    if (reagendamientos > 0) {
      throw new Error(
        `AddReagendamientoASolicitudesCita.down: hay ${reagendamientos} solicitud(es) de reagendamiento que el esquema anterior no puede representar. ` +
          'Decide a mano qué hacer con ellas (ver el comentario de la migración) y vuelve a intentar.',
      );
    }

    // Revertir en orden inverso.
    await queryRunner.query(`
      DROP INDEX "public"."idx_solicitud_tenant_cita_origen"
    `);

    await queryRunner.query(`
      DROP INDEX "public"."uq_solicitud_reagendamiento_recibida"
    `);

    await queryRunner.query(`
      ALTER TABLE "solicitudes_cita"
        DROP CONSTRAINT "CHK_solicitudes_cita_nueva_datos"
    `);

    await queryRunner.query(`
      ALTER TABLE "solicitudes_cita"
        DROP CONSTRAINT "CHK_solicitudes_cita_reagendamiento_origen"
    `);

    await queryRunner.query(`
      ALTER TABLE "solicitudes_cita"
        ALTER COLUMN "correo" SET NOT NULL,
        ALTER COLUMN "rut" SET NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "solicitudes_cita"
        DROP COLUMN "enlace_id",
        DROP COLUMN "cita_origen_id",
        DROP COLUMN "tipo"
    `);

    await queryRunner.query(`
      DROP TYPE "public"."enum_solicitudes_cita_tipo"
    `);
  }
}
