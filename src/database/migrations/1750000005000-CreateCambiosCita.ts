import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ADR-09 §6: bitacora inmutable de cambios de una cita.
 *
 * Append-only. Se escribe en la misma transaccion que la mutacion de la cita:
 * si el cambio no queda registrado, el cambio no ocurre. Es lo que permite
 * responder "cuantas veces se movio esta cita y quien la movio" — la materia
 * prima de RF-08 y la deuda que ADR-04 dejo abierta (DT-22).
 *
 * No hay columna `actualizado_en` a proposito: una fila nunca se modifica.
 */
export class CreateCambiosCita1750000005000 implements MigrationInterface {
  name = 'CreateCambiosCita1750000005000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Tipo de cambio. Cubre las transiciones de estado y tambien los
    //    cambios que no mueven el estado (editar, reagendar).
    await queryRunner.query(`
      CREATE TYPE "public"."enum_cambios_cita_tipo" AS ENUM(
        'creada',
        'editada',
        'reagendada',
        'confirmada',
        'cancelada',
        'asistio',
        'no_asistio',
        'ghosting'
      )
    `);

    // 2. Quien provoco el cambio. Hoy solo se usa 'profesional'; 'paciente'
    //    llega con la via publica y 'sistema' con el job de cierre.
    await queryRunner.query(`
      CREATE TYPE "public"."enum_cambios_cita_actor" AS ENUM(
        'profesional',
        'paciente',
        'sistema'
      )
    `);

    // 3. Tabla. Reutiliza el enum de estados de la cita (creado en la
    //    migracion 1750000003000) para el antes/despues del estado.
    await queryRunner.query(`
      CREATE TABLE "cambios_cita" (
        "id"              UUID        NOT NULL DEFAULT gen_random_uuid(),
        "cita_id"         UUID        NOT NULL,
        "tenant_id"       UUID        NOT NULL,
        "tipo"            "public"."enum_cambios_cita_tipo"  NOT NULL,
        "estado_anterior" "public"."enum_citas_estado",
        "estado_nuevo"    "public"."enum_citas_estado",
        "inicio_anterior" TIMESTAMPTZ,
        "inicio_nuevo"    TIMESTAMPTZ,
        "motivo"          VARCHAR,
        "actor_tipo"      "public"."enum_cambios_cita_actor" NOT NULL,
        "actor_id"        UUID,
        "ocurrido_en"     TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_cambios_cita_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_cambios_cita_cita_id" FOREIGN KEY ("cita_id")
          REFERENCES "citas" ("id")
          ON DELETE RESTRICT
          ON UPDATE CASCADE,
        CONSTRAINT "FK_cambios_cita_tenant_id" FOREIGN KEY ("tenant_id")
          REFERENCES "tenants" ("id")
          ON DELETE RESTRICT
          ON UPDATE CASCADE
      )
    `);

    // 4. Indice que soporta la consulta del historial: todos los cambios de
    //    una cita en orden cronologico.
    await queryRunner.query(`
      CREATE INDEX "idx_cambio_cita_ocurrido"
        ON "cambios_cita" ("cita_id", "ocurrido_en")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Revertir en orden inverso.
    await queryRunner.query(`
      DROP INDEX "public"."idx_cambio_cita_ocurrido"
    `);

    await queryRunner.query(`
      DROP TABLE "cambios_cita"
    `);

    await queryRunner.query(`
      DROP TYPE "public"."enum_cambios_cita_actor"
    `);

    await queryRunner.query(`
      DROP TYPE "public"."enum_cambios_cita_tipo"
    `);
  }
}
