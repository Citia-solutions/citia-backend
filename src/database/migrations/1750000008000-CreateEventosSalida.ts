import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ADR-12 §1: outbox de hechos de dominio (cierra DT-27 en el esquema).
 *
 * Cada hecho se escribe en esta tabla EN LA MISMA TRANSACCIÓN que el cambio de
 * negocio que lo produce: o existen los dos o ninguno. Un despachador lo
 * entrega después a los suscriptores, con reintentos (ADR-12 §3).
 *
 * - `tenant_id` NO lleva clave foránea a propósito: la tabla es
 *   infraestructura y no debe acoplarse al esquema de ningún módulo.
 * - `estado` es VARCHAR + CHECK (no un tipo ENUM de Postgres como en las tablas
 *   de negocio): es vocabulario de infraestructura, y ampliarlo es cambiar un
 *   CHECK, no un `ALTER TYPE` que no se puede revertir.
 * - `payload` solo lleva ids y datos no sensibles (ADR-09 §3 regla 5).
 * - `ultimo_error` guarda un código o mensaje corto, nunca datos personales.
 *   El adaptador lo trunca antes de escribirlo.
 * - `fallido` es la carta muerta: no se purga, se revisa a mano.
 *
 * El índice parcial cubre SOLO los pendientes: es lo que lee el reclamo
 * (`estado = 'pendiente' AND proximo_intento_en <= ahora ... FOR UPDATE SKIP
 * LOCKED`). Los entregados y fallidos, que son casi toda la tabla, no lo
 * engordan.
 *
 * El `down` borra la tabla y, con ella, los hechos que estuvieran sin entregar.
 */
export class CreateEventosSalida1750000008000 implements MigrationInterface {
  name = 'CreateEventosSalida1750000008000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "eventos_salida" (
        "id"                 UUID        NOT NULL DEFAULT gen_random_uuid(),
        "nombre"             VARCHAR     NOT NULL,
        "tenant_id"          UUID        NOT NULL,
        "payload"            JSONB       NOT NULL,
        "ocurrido_en"        TIMESTAMPTZ NOT NULL,
        "estado"             VARCHAR     NOT NULL DEFAULT 'pendiente',
        "intentos"           INTEGER     NOT NULL DEFAULT 0,
        "proximo_intento_en" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "ultimo_error"       VARCHAR,
        "entregado_en"       TIMESTAMPTZ,
        "creado_en"          TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_eventos_salida_id" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_eventos_salida_estado"
          CHECK ("estado" IN ('pendiente', 'entregado', 'fallido'))
      )
    `);

    // Cola del despachador: solo los pendientes, por próximo intento.
    await queryRunner.query(`
      CREATE INDEX "idx_salida_pendientes"
        ON "eventos_salida" ("proximo_intento_en")
        WHERE "estado" = 'pendiente'
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Revertir en orden inverso.
    await queryRunner.query(`
      DROP INDEX "public"."idx_salida_pendientes"
    `);

    await queryRunner.query(`
      DROP TABLE "eventos_salida"
    `);
  }
}
