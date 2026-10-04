import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ADR-09 §1: la petición del paciente es un agregado aparte, no un estado de
 * `Cita`.
 *
 * Mantener `citas` con el significado "compromiso real" es lo que evita que el
 * spam y los rechazos contaminen el historial de comportamiento del paciente
 * (RF-08). La superficie anónima escribe SOLO en esta tabla.
 *
 * `usuario_id` es nullable: el enlace público pertenece a la organización, y el
 * profesional dueño queda definido cuando alguien acepta la solicitud.
 *
 * `cita_id` NO lleva clave foránea a propósito: el módulo `solicitud` no
 * depende del módulo `cita`, y la referencia se puebla recién al aceptar.
 *
 * ⚠️ Las columnas de datos del paciente son PROVISIONALES: reflejan los campos
 * de ADR-09 §10, y el formulario del frontend todavía no está cerrado.
 */
export class CreateSolicitudesCita1750000006000 implements MigrationInterface {
  name = 'CreateSolicitudesCita1750000006000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Estados de la solicitud. Vocabulario distinto al de las citas
    //    ('recibida' vs 'pendiente') para que no se confundan dos ciclos de
    //    vida que significan cosas opuestas.
    await queryRunner.query(`
      CREATE TYPE "public"."enum_solicitudes_cita_estado" AS ENUM(
        'recibida',
        'aceptada',
        'rechazada'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "solicitudes_cita" (
        "id"                  UUID        NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id"           UUID        NOT NULL,
        "usuario_id"          UUID,
        "rut"                 VARCHAR     NOT NULL,
        "nombre_paciente"     VARCHAR     NOT NULL,
        "telefono"            VARCHAR     NOT NULL,
        "correo"              VARCHAR     NOT NULL,
        "motivo"              VARCHAR     NOT NULL,
        "preferencia_horaria" VARCHAR     NOT NULL,
        "consentimiento"      BOOLEAN     NOT NULL DEFAULT false,
        "estado"              "public"."enum_solicitudes_cita_estado" NOT NULL DEFAULT 'recibida',
        "cita_id"             UUID,
        "recibida_en"         TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_solicitudes_cita_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_solicitudes_cita_tenant_id" FOREIGN KEY ("tenant_id")
          REFERENCES "tenants" ("id")
          ON DELETE RESTRICT
          ON UPDATE CASCADE,
        CONSTRAINT "FK_solicitudes_cita_usuario_id" FOREIGN KEY ("usuario_id")
          REFERENCES "usuarios" ("id")
          ON DELETE RESTRICT
          ON UPDATE CASCADE
      )
    `);

    // 2. Bandeja: las solicitudes sin resolver de una organización.
    await queryRunner.query(`
      CREATE INDEX "idx_solicitud_tenant_estado"
        ON "solicitudes_cita" ("tenant_id", "estado")
    `);

    // 3. Regla anti-spam: si ese RUT ya tiene una solicitud abierta reciente en
    //    la organización, la nueva se descarta.
    await queryRunner.query(`
      CREATE INDEX "idx_solicitud_tenant_rut_estado"
        ON "solicitudes_cita" ("tenant_id", "rut", "estado")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Revertir en orden inverso.
    await queryRunner.query(`
      DROP INDEX "public"."idx_solicitud_tenant_rut_estado"
    `);

    await queryRunner.query(`
      DROP INDEX "public"."idx_solicitud_tenant_estado"
    `);

    await queryRunner.query(`
      DROP TABLE "solicitudes_cita"
    `);

    await queryRunner.query(`
      DROP TYPE "public"."enum_solicitudes_cita_estado"
    `);
  }
}
