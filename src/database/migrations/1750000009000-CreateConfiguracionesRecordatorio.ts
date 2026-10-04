import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ADR-13 §2–§3: configuración de recordatorios, una fila por profesional.
 *
 * - `usuario_id` es el profesional DUEÑO de las citas (`citas.usuario_id`).
 * - Sin fila se aplica la configuración predeterminada del entorno
 *   (`RECORDATORIO_ANTELACIONES_MIN`, activa): no hace falta migrar datos para
 *   los usuarios existentes. La fila nace la primera vez que el profesional
 *   guarda (upsert por `(tenant_id, usuario_id)`).
 * - Las reglas (1 a 3 antelaciones distintas entre 30 y 10.080 min, teléfono
 *   de hasta 30, formato del correo) son del dominio, no de la base.
 * - `canal` es VARCHAR + CHECK (como `eventos_salida`): agregar WhatsApp es
 *   cambiar un CHECK, no un `ALTER TYPE` irreversible.
 * - FKs con la convención del proyecto (`ON DELETE RESTRICT`, `ON UPDATE
 *   CASCADE`); ADR-13 no pide otra cosa.
 *
 * El `down` borra la tabla y, con ella, la configuración guardada por los
 * profesionales (vuelven a la predeterminada).
 */
export class CreateConfiguracionesRecordatorio1750000009000 implements MigrationInterface {
  name = 'CreateConfiguracionesRecordatorio1750000009000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "configuraciones_recordatorio" (
        "id"                UUID        NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id"         UUID        NOT NULL,
        "usuario_id"        UUID        NOT NULL,
        "activo"            BOOLEAN     NOT NULL DEFAULT true,
        "canal"             VARCHAR     NOT NULL DEFAULT 'email',
        "antelaciones_min"  INTEGER[]   NOT NULL,
        "telefono_contacto" VARCHAR,
        "correo_respuesta"  VARCHAR,
        "creado_en"         TIMESTAMPTZ NOT NULL DEFAULT now(),
        "actualizado_en"    TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_configuraciones_recordatorio_id" PRIMARY KEY ("id"),
        CONSTRAINT "uq_configuracion_recordatorio_tenant_usuario"
          UNIQUE ("tenant_id", "usuario_id"),
        CONSTRAINT "CHK_configuraciones_recordatorio_canal"
          CHECK ("canal" IN ('email')),
        CONSTRAINT "FK_configuraciones_recordatorio_tenant_id" FOREIGN KEY ("tenant_id")
          REFERENCES "tenants" ("id")
          ON DELETE RESTRICT
          ON UPDATE CASCADE,
        CONSTRAINT "FK_configuraciones_recordatorio_usuario_id" FOREIGN KEY ("usuario_id")
          REFERENCES "usuarios" ("id")
          ON DELETE RESTRICT
          ON UPDATE CASCADE
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE "configuraciones_recordatorio"
    `);
  }
}
