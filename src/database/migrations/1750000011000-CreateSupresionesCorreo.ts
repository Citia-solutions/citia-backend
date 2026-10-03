import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ADR-13 §2: direcciones a las que no se vuelve a escribir (rebote permanente
 * o queja, ADR-13 §10).
 *
 * - **Global, no por tenant**, a propósito: el remitente es uno solo (Citia) y
 *   la reputación ante los proveedores de correo es de toda la plataforma.
 * - **Solo el hash**: `correo_hash` = SHA-256 hex del correo normalizado (sin
 *   espacios, en minúsculas). Es la PK. El CHECK de formato impide que una
 *   dirección en claro termine guardada por error.
 * - `origen_recordatorio_id` sin FK: la supresión sobrevive a su recordatorio.
 *
 * Quitar una dirección se hace con SQL (deuda prevista 5 de ADR-13):
 *   DELETE FROM supresiones_correo
 *    WHERE correo_hash = encode(sha256(convert_to(lower(btrim('<correo>')), 'UTF8')), 'hex');
 *
 * El `down` borra la tabla: las direcciones suprimidas vuelven a recibir.
 */
export class CreateSupresionesCorreo1750000011000 implements MigrationInterface {
  name = 'CreateSupresionesCorreo1750000011000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "supresiones_correo" (
        "correo_hash"            VARCHAR     NOT NULL,
        "motivo"                 VARCHAR     NOT NULL,
        "origen_recordatorio_id" UUID,
        "creado_en"              TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_supresiones_correo_correo_hash" PRIMARY KEY ("correo_hash"),
        CONSTRAINT "CHK_supresiones_correo_hash"
          CHECK ("correo_hash" ~ '^[0-9a-f]{64}$'),
        CONSTRAINT "CHK_supresiones_correo_motivo"
          CHECK ("motivo" IN ('rebote', 'queja'))
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE "supresiones_correo"
    `);
  }
}
