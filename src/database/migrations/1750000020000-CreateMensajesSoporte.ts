import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * US-10 (plan `context/US/10-perfil-cuenta.md`, ADR-15 §7): mensajes de un
 * profesional a soporte.
 *
 * - **La fila es la fila de trabajo** de su correo (T8, ADR-12 §4 regla 4):
 *   se inserta `pendiente` en la transacción de la petición y el job
 *   `soporte.envio` la reclama con `FOR UPDATE SKIP LOCKED` y la envía. Sin
 *   hecho en `eventos_salida`.
 * - `mensaje` TEXT con su largo en un CHECK (1 a 2000 caracteres y no solo
 *   espacios). `char_length` cuenta caracteres; el `MaxLength` del DTO cuenta
 *   unidades UTF-16, que nunca son menos: lo que pasa el DTO pasa el CHECK.
 *   **El texto nunca va a los logs** y todavía no tiene plazo de conservación
 *   (DT-26).
 * - `categoria` y `estado_envio` son VARCHAR + CHECK, no tipos enum (como
 *   `eventos_salida` y `recordatorios`): sin diferencias de nombres de tipo
 *   entre la migración y `synchronize`.
 * - `CHK_mensajes_soporte_enviado`: `enviado_en` existe si y solo si el
 *   mensaje está `enviado`.
 * - `ultimo_error` guarda solo un código (nombre del error o código de
 *   Resend), nunca un mensaje. `proveedor` = `resend` o `registro` (con
 *   `registro` un mensaje queda `enviado` sin haber salido, DT-40).
 * - FKs a `tenants` y `usuarios` con la convención del proyecto
 *   (`ON DELETE RESTRICT`, `ON UPDATE CASCADE`). Ninguna tabla referencia a
 *   esta: el reclamo puede usar `FOR UPDATE` (no hace falta `FOR NO KEY UPDATE`).
 *
 * Índices:
 * - `idx_mensajes_soporte_pendientes`: PARCIAL sobre `proximo_intento_en` de
 *   las `pendiente` (el reclamo del job, BARRIDO GLOBAL de ADR-12 §6). Para
 *   que el planificador lo use, la consulta escribe el predicado igual:
 *   `"estado_envio" = 'pendiente'`.
 * - `idx_mensajes_soporte_tenant_creado`: el tope de 5 mensajes por
 *   organización en 24 horas (cuenta por `tenant_id` y `creado_en`).
 *
 * ⚠️ `down` (destructivo): borra la tabla (los índices caen con ella). Se
 * pierden todos los mensajes, también los `pendiente` que no salieron.
 */
export class CreateMensajesSoporte1750000020000 implements MigrationInterface {
  name = 'CreateMensajesSoporte1750000020000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "mensajes_soporte" (
        "id"                   UUID         NOT NULL DEFAULT gen_random_uuid(),
        "tenant_id"            UUID         NOT NULL,
        "usuario_id"           UUID         NOT NULL,
        "categoria"            VARCHAR(20)  NOT NULL DEFAULT 'otro',
        "mensaje"              TEXT         NOT NULL,
        "estado_envio"         VARCHAR(20)  NOT NULL DEFAULT 'pendiente',
        "intentos"             INTEGER      NOT NULL DEFAULT 0,
        "proximo_intento_en"   TIMESTAMPTZ  NOT NULL DEFAULT now(),
        "ultimo_error"         VARCHAR(100),
        "proveedor"            VARCHAR(20),
        "proveedor_mensaje_id" VARCHAR(100),
        "enviado_en"           TIMESTAMPTZ,
        "creado_en"            TIMESTAMPTZ  NOT NULL DEFAULT now(),
        CONSTRAINT "PK_mensajes_soporte_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_mensajes_soporte_tenant_id" FOREIGN KEY ("tenant_id")
          REFERENCES "tenants" ("id")
          ON DELETE RESTRICT
          ON UPDATE CASCADE,
        CONSTRAINT "FK_mensajes_soporte_usuario_id" FOREIGN KEY ("usuario_id")
          REFERENCES "usuarios" ("id")
          ON DELETE RESTRICT
          ON UPDATE CASCADE,
        CONSTRAINT "CHK_mensajes_soporte_categoria"
          CHECK ("categoria" IN ('problema', 'consulta', 'sugerencia', 'otro')),
        CONSTRAINT "CHK_mensajes_soporte_mensaje"
          CHECK (char_length("mensaje") BETWEEN 1 AND 2000 AND btrim("mensaje") <> ''),
        CONSTRAINT "CHK_mensajes_soporte_estado_envio"
          CHECK ("estado_envio" IN ('pendiente', 'enviado', 'fallido')),
        CONSTRAINT "CHK_mensajes_soporte_enviado"
          CHECK (("estado_envio" = 'enviado') = ("enviado_en" IS NOT NULL)),
        CONSTRAINT "CHK_mensajes_soporte_intentos"
          CHECK ("intentos" >= 0)
      )
    `);

    // El job: solo mira las pendientes, por próximo intento.
    await queryRunner.query(`
      CREATE INDEX "idx_mensajes_soporte_pendientes"
        ON "mensajes_soporte" ("proximo_intento_en")
        WHERE "estado_envio" = 'pendiente'
    `);

    // El tope por organización: cuenta las de las últimas 24 horas.
    await queryRunner.query(`
      CREATE INDEX "idx_mensajes_soporte_tenant_creado"
        ON "mensajes_soporte" ("tenant_id", "creado_en")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Los dos índices caen con la tabla.
    await queryRunner.query(`
      DROP TABLE "mensajes_soporte"
    `);
  }
}
