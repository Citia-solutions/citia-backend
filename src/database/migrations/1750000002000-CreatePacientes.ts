import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePacientes1750000002000 implements MigrationInterface {
  name = 'CreatePacientes1750000002000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // Tabla pacientes: pertenecen al tenant (compartidos entre profesionales
    // de una clínica). CRUD mínimo para soportar la referencia desde Cita.
    await queryRunner.query(`
      CREATE TABLE "pacientes" (
        "id"             UUID        NOT NULL DEFAULT gen_random_uuid(),
        "nombre"         VARCHAR     NOT NULL,
        "contacto"       VARCHAR     NOT NULL,
        "consentimiento" BOOLEAN     NOT NULL DEFAULT false,
        "tenant_id"      UUID        NOT NULL,
        "creado_en"      TIMESTAMPTZ NOT NULL DEFAULT now(),
        "actualizado_en" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_pacientes_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_pacientes_tenant_id" FOREIGN KEY ("tenant_id")
          REFERENCES "tenants" ("id")
          ON DELETE RESTRICT
          ON UPDATE CASCADE
      )
    `);

    // Índice en tenant_id para acelerar el filtrado por tenant.
    await queryRunner.query(`
      CREATE INDEX "idx_paciente_tenant" ON "pacientes" ("tenant_id")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Revertir en orden inverso.
    await queryRunner.query(`
      DROP INDEX "public"."idx_paciente_tenant"
    `);

    await queryRunner.query(`
      DROP TABLE "pacientes"
    `);
  }
}
