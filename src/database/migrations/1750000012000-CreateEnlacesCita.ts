import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fase 3 (US-04 + US-02.07), contrato §2.1: enlace del paciente a su cita.
 *
 * - **Solo el hash**: `token_hash` = SHA-256 hex del token (el token es
 *   `base64url(HMAC-SHA256(ENLACE_CITA_CLAVE, "enlace-cita:" + cita + ":" + version))`
 *   y se recalcula; nunca se guarda). El CHECK de formato impide que un token
 *   en claro (43 caracteres base64url) termine guardado por error: en un
 *   `CHAR(64)` se rellenaría con espacios sin avisar.
 * - `id` es el `actor_id` del paciente en `cambios_cita` (`actor_tipo = 'paciente'`).
 * - `version` empieza en 1; invalidar sube la versión (el siguiente enlace es
 *   `max(version) + 1`).
 * - FK a `citas` con la convención del proyecto (`ON DELETE RESTRICT`,
 *   `ON UPDATE CASCADE`). `tenant_id` sin FK, como en `recordatorios`: el
 *   tenant de la fila es el de su cita.
 * - `motivo_revocacion`: hoy solo `invalidado`. El CHECK de coherencia exige
 *   que un enlace activo no tenga datos de revocación y que uno revocado
 *   tenga su motivo (`revocado_por` puede quedar NULL para una revocación
 *   futura del sistema).
 *
 * Índices:
 * - `uq_enlace_cita_token_hash`: búsqueda por token (`resolver`) y unicidad.
 * - `uq_enlace_cita_version`: una fila por (cita, versión). Junto con la
 *   derivación determinista del token, hace idempotente `asegurarActivo`.
 * - `uq_enlace_cita_activo`: única PARCIAL por cita sin revocar → máximo un
 *   enlace activo por cita. Destino (implícito) del
 *   `INSERT … ON CONFLICT DO NOTHING` de `asegurarActivo`.
 *
 * ⚠️ El `down` borra la tabla: los enlaces ya enviados por correo dejan de
 * resolver y se pierde el `actor_id` de las respuestas del paciente (las filas
 * de `cambios_cita` quedan con un id que ya no apunta a nada; no hay FK).
 */
export class CreateEnlacesCita1750000012000 implements MigrationInterface {
  name = 'CreateEnlacesCita1750000012000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "enlaces_cita" (
        "id"                UUID        NOT NULL DEFAULT gen_random_uuid(),
        "cita_id"           UUID        NOT NULL,
        "tenant_id"         UUID        NOT NULL,
        "version"           INTEGER     NOT NULL,
        "token_hash"        CHAR(64)    NOT NULL,
        "emitido_en"        TIMESTAMPTZ NOT NULL DEFAULT now(),
        "revocado_en"       TIMESTAMPTZ,
        "motivo_revocacion" VARCHAR,
        "revocado_por"      UUID,
        CONSTRAINT "PK_enlaces_cita_id" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_enlaces_cita_version" CHECK ("version" >= 1),
        CONSTRAINT "CHK_enlaces_cita_token_hash"
          CHECK ("token_hash" ~ '^[0-9a-f]{64}$'),
        CONSTRAINT "CHK_enlaces_cita_revocacion" CHECK (
          ("revocado_en" IS NULL AND "motivo_revocacion" IS NULL AND "revocado_por" IS NULL)
          OR ("revocado_en" IS NOT NULL AND "motivo_revocacion" IS NOT NULL
              AND "motivo_revocacion" IN ('invalidado'))
        ),
        CONSTRAINT "FK_enlaces_cita_cita_id" FOREIGN KEY ("cita_id")
          REFERENCES "citas" ("id")
          ON DELETE RESTRICT
          ON UPDATE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_enlace_cita_token_hash"
        ON "enlaces_cita" ("token_hash")
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_enlace_cita_version"
        ON "enlaces_cita" ("cita_id", "version")
    `);

    // Máximo un enlace activo por cita (E1).
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_enlace_cita_activo"
        ON "enlaces_cita" ("cita_id")
        WHERE "revocado_en" IS NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Revertir en orden inverso.
    await queryRunner.query(`
      DROP INDEX "public"."uq_enlace_cita_activo"
    `);

    await queryRunner.query(`
      DROP INDEX "public"."uq_enlace_cita_version"
    `);

    await queryRunner.query(`
      DROP INDEX "public"."uq_enlace_cita_token_hash"
    `);

    await queryRunner.query(`
      DROP TABLE "enlaces_cita"
    `);
  }
}
