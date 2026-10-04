import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCitas1750000003000 implements MigrationInterface {
  name = 'CreateCitas1750000003000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Enum de estado de la cita (grafo cerrado de estados).
    await queryRunner.query(`
      CREATE TYPE "public"."enum_citas_estado" AS ENUM(
        'pendiente',
        'confirmada',
        'cancelada',
        'asistio',
        'no_asistio',
        'ghosting'
      )
    `);

    // 2. Tabla citas con 3 FK: tenant, paciente y usuario (profesional).
    await queryRunner.query(`
      CREATE TABLE "citas" (
        "id"             UUID        NOT NULL DEFAULT gen_random_uuid(),
        "inicio"         TIMESTAMPTZ NOT NULL,
        "duracion_min"   INTEGER     NOT NULL,
        "tipo_consulta"  VARCHAR     NOT NULL,
        "estado"         "public"."enum_citas_estado" NOT NULL DEFAULT 'pendiente',
        "tenant_id"      UUID        NOT NULL,
        "paciente_id"    UUID        NOT NULL,
        "usuario_id"     UUID        NOT NULL,
        "creado_en"      TIMESTAMPTZ NOT NULL DEFAULT now(),
        "actualizado_en" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_citas_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_citas_tenant_id" FOREIGN KEY ("tenant_id")
          REFERENCES "tenants" ("id")
          ON DELETE RESTRICT
          ON UPDATE CASCADE,
        CONSTRAINT "FK_citas_paciente_id" FOREIGN KEY ("paciente_id")
          REFERENCES "pacientes" ("id")
          ON DELETE RESTRICT
          ON UPDATE CASCADE,
        CONSTRAINT "FK_citas_usuario_id" FOREIGN KEY ("usuario_id")
          REFERENCES "usuarios" ("id")
          ON DELETE RESTRICT
          ON UPDATE CASCADE
      )
    `);

    // 3. Índice compuesto que soporta la consulta del dashboard:
    //    filtro por (tenant_id, usuario_id) + orden cronológico por inicio.
    await queryRunner.query(`
      CREATE INDEX "idx_cita_tenant_usuario_inicio"
        ON "citas" ("tenant_id", "usuario_id", "inicio")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Revertir en orden inverso.
    await queryRunner.query(`
      DROP INDEX "public"."idx_cita_tenant_usuario_inicio"
    `);

    await queryRunner.query(`
      DROP TABLE "citas"
    `);

    await queryRunner.query(`
      DROP TYPE "public"."enum_citas_estado"
    `);
  }
}
