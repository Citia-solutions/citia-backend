import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateTenantsAndUsuarios1750000000000 implements MigrationInterface {
  name = 'CreateTenantsAndUsuarios1750000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Crear enum para el tipo de tenant
    await queryRunner.query(`
      CREATE TYPE "public"."enum_tenants_tipo" AS ENUM('CLINICA', 'INDEPENDIENTE')
    `);

    // 2. Crear tabla tenants
    await queryRunner.query(`
      CREATE TABLE "tenants" (
        "id"        UUID        NOT NULL DEFAULT gen_random_uuid(),
        "nombre"    VARCHAR     NOT NULL,
        "tipo"      "public"."enum_tenants_tipo" NOT NULL DEFAULT 'INDEPENDIENTE',
        "plan"      VARCHAR     NOT NULL DEFAULT 'free',
        "creado_en" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_tenants_id" PRIMARY KEY ("id")
      )
    `);

    // 3. Crear enum para el rol de usuario
    await queryRunner.query(`
      CREATE TYPE "public"."enum_usuarios_rol" AS ENUM('PROFESIONAL', 'ADMINISTRADOR')
    `);

    // 4. Crear tabla usuarios con FK, unique constraint e índice
    await queryRunner.query(`
      CREATE TABLE "usuarios" (
        "id"              UUID        NOT NULL DEFAULT gen_random_uuid(),
        "email"           VARCHAR     NOT NULL,
        "password_hash"   VARCHAR     NOT NULL,
        "nombre_completo" VARCHAR     NOT NULL,
        "rol"             "public"."enum_usuarios_rol" NOT NULL DEFAULT 'PROFESIONAL',
        "tenant_id"       UUID        NOT NULL,
        "creado_en"       TIMESTAMPTZ NOT NULL DEFAULT now(),
        "actualizado_en"  TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_usuarios_id" PRIMARY KEY ("id"),
        CONSTRAINT "uq_usuario_email_tenant" UNIQUE ("tenant_id", "email"),
        CONSTRAINT "FK_usuarios_tenant_id" FOREIGN KEY ("tenant_id")
          REFERENCES "tenants" ("id")
          ON DELETE RESTRICT
          ON UPDATE CASCADE
      )
    `);

    // 5. Índice en tenant_id para acelerar búsquedas por tenant
    await queryRunner.query(`
      CREATE INDEX "idx_usuario_tenant" ON "usuarios" ("tenant_id")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Revertir en orden inverso

    // 1. Eliminar índice
    await queryRunner.query(`
      DROP INDEX "public"."idx_usuario_tenant"
    `);

    // 2. Eliminar tabla usuarios (destructivo — esperado en migración inicial)
    await queryRunner.query(`
      DROP TABLE "usuarios"
    `);

    // 3. Eliminar enum de rol de usuario
    await queryRunner.query(`
      DROP TYPE "public"."enum_usuarios_rol"
    `);

    // 4. Eliminar tabla tenants (destructivo — esperado en migración inicial)
    await queryRunner.query(`
      DROP TABLE "tenants"
    `);

    // 5. Eliminar enum de tipo de tenant
    await queryRunner.query(`
      DROP TYPE "public"."enum_tenants_tipo"
    `);
  }
}
