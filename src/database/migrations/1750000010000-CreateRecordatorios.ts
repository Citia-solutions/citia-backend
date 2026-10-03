import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ADR-13 §2 y §4: un recordatorio por cita, canal y antelación, con estado.
 *
 * - **Sin destinatario ni contenido.** El correo se lee del paciente al
 *   enviar; el registro de entrega es el estado, las fechas y el id del
 *   proveedor. `ultimo_error` guarda un código, nunca datos personales.
 * - `id` es también la clave de idempotencia ante el proveedor (ADR-13 §9).
 * - `programado_para` es la hora PLANIFICADA y forma parte de la clave;
 *   `proximo_intento_en` es la hora REAL de la cola (tardíos, reintentos,
 *   posposiciones).
 * - `tenant_id` sin FK, como lo dibuja ADR-13 (solo `cita_id` la lleva); el
 *   tenant de una fila es el de su cita.
 * - `estado` y `motivo` son VARCHAR + CHECK (como `eventos_salida`). El CHECK
 *   de motivo los EMPAREJA según ADR-13 §4: `programado`, `enviado` y
 *   `entregado` sin motivo; cada final negativo solo con sus motivos. El
 *   `"motivo" IS NOT NULL` explícito es necesario: `NULL IN (...)` da NULL, y
 *   un CHECK que evalúa NULL se da por cumplido (un `cancelado` sin motivo
 *   pasaría).
 * - FK a `citas` con la convención del proyecto (`ON DELETE RESTRICT`,
 *   `ON UPDATE CASCADE`); ADR-13 no pide otra cosa. Las citas no se borran.
 *
 * Índices:
 * - `uq_recordatorio_clave`: única PARCIAL (cita, canal, antelación, hora
 *   planificada) sin contar los `cancelado`. Reagendar y volver a la hora
 *   original no choca con los anulados; los `enviado`/`entregado` sí bloquean.
 *   Es el destino del `ON CONFLICT DO NOTHING` de la reconciliación.
 * - `idx_recordatorio_cola`: solo los `programado`, por `proximo_intento_en`
 *   (el reclamo con `FOR UPDATE SKIP LOCKED`).
 * - `idx_recordatorio_cita`: la ruta de estado y el respaldo (`NOT EXISTS`).
 * - `idx_recordatorio_proveedor`: el webhook sin etiqueta.
 * - `idx_recordatorio_enviado_en`: el contador de cuota, solo los enviados.
 *
 * El `down` borra la tabla y, con ella, el registro de entrega.
 */
export class CreateRecordatorios1750000010000 implements MigrationInterface {
  name = 'CreateRecordatorios1750000010000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "recordatorios" (
        "id"                   UUID        NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id"            UUID        NOT NULL,
        "cita_id"              UUID        NOT NULL,
        "canal"                VARCHAR     NOT NULL,
        "antelacion_min"       INTEGER     NOT NULL,
        "inicio_cita"          TIMESTAMPTZ NOT NULL,
        "programado_para"      TIMESTAMPTZ NOT NULL,
        "vence_en"             TIMESTAMPTZ NOT NULL,
        "estado"               VARCHAR     NOT NULL,
        "motivo"               VARCHAR,
        "intentos"             INTEGER     NOT NULL DEFAULT 0,
        "proximo_intento_en"   TIMESTAMPTZ NOT NULL,
        "ultimo_error"         VARCHAR,
        "proveedor"            VARCHAR,
        "proveedor_mensaje_id" VARCHAR,
        "enviado_en"           TIMESTAMPTZ,
        "entregado_en"         TIMESTAMPTZ,
        "queja_en"             TIMESTAMPTZ,
        "creado_en"            TIMESTAMPTZ NOT NULL DEFAULT now(),
        "actualizado_en"       TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_recordatorios_id" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_recordatorios_canal"
          CHECK ("canal" IN ('email')),
        CONSTRAINT "CHK_recordatorios_estado"
          CHECK ("estado" IN ('programado', 'enviado', 'entregado', 'fallido', 'cancelado', 'omitido')),
        CONSTRAINT "CHK_recordatorios_motivo" CHECK (
          ("estado" IN ('programado', 'enviado', 'entregado') AND "motivo" IS NULL)
          OR ("estado" = 'cancelado' AND "motivo" IS NOT NULL
              AND "motivo" IN ('cita_terminal', 'reprogramado', 'desactivado'))
          OR ("estado" = 'omitido' AND "motivo" IS NOT NULL
              AND "motivo" IN ('creada_tarde', 'fusionado', 'sin_correo', 'correo_suprimido', 'limite_tenant', 'sin_consentimiento'))
          OR ("estado" = 'fallido' AND "motivo" IS NOT NULL
              AND "motivo" IN ('correo_invalido', 'rechazado', 'vencido', 'cuota_agotada', 'rebote'))
        ),
        CONSTRAINT "FK_recordatorios_cita_id" FOREIGN KEY ("cita_id")
          REFERENCES "citas" ("id")
          ON DELETE RESTRICT
          ON UPDATE CASCADE
      )
    `);

    // Clave única parcial: no puede haber dos recordatorios vivos para lo
    // mismo, por muchos hechos repetidos que lleguen (ADR-13 §9 capa 1).
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_recordatorio_clave"
        ON "recordatorios" ("cita_id", "canal", "antelacion_min", "programado_para")
        WHERE "estado" <> 'cancelado'
    `);

    // Cola del envío: solo los programados, por hora real del próximo intento.
    await queryRunner.query(`
      CREATE INDEX "idx_recordatorio_cola"
        ON "recordatorios" ("proximo_intento_en")
        WHERE "estado" = 'programado'
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_recordatorio_cita"
        ON "recordatorios" ("cita_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "idx_recordatorio_proveedor"
        ON "recordatorios" ("proveedor_mensaje_id")
    `);

    // Contador local de la cuota (ADR-13 §11): solo filas ya enviadas.
    await queryRunner.query(`
      CREATE INDEX "idx_recordatorio_enviado_en"
        ON "recordatorios" ("enviado_en")
        WHERE "enviado_en" IS NOT NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Revertir en orden inverso.
    await queryRunner.query(`
      DROP INDEX "public"."idx_recordatorio_enviado_en"
    `);

    await queryRunner.query(`
      DROP INDEX "public"."idx_recordatorio_proveedor"
    `);

    await queryRunner.query(`
      DROP INDEX "public"."idx_recordatorio_cita"
    `);

    await queryRunner.query(`
      DROP INDEX "public"."idx_recordatorio_cola"
    `);

    await queryRunner.query(`
      DROP INDEX "public"."uq_recordatorio_clave"
    `);

    await queryRunner.query(`
      DROP TABLE "recordatorios"
    `);
  }
}
