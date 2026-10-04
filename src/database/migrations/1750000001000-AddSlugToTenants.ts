import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSlugToTenants1750000001000 implements MigrationInterface {
  name = 'AddSlugToTenants1750000001000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // Esta migración añade el identificador único `slug` a los tenants para
    // habilitar el login multi-tenant por slug.
    //
    // Como `slug` debe terminar siendo NOT NULL UNIQUE pero puede haber filas
    // existentes en la BD (entornos dev), lo hacemos en pasos seguros:
    //   1) añadir la columna como NULLABLE,
    //   2) backfill de los tenants existentes con un slug derivado y único,
    //   3) imponer NOT NULL,
    //   4) crear el índice/constraint UNIQUE.

    // 1. Añadir la columna como NULLABLE (no rompe filas existentes).
    await queryRunner.query(`
      ALTER TABLE "tenants" ADD COLUMN "slug" VARCHAR
    `);

    // 2. Backfill de filas existentes.
    //    Derivamos el slug del `nombre` (minúsculas, espacios/símbolos -> '-')
    //    y lo sufijamos con los primeros 8 caracteres del `id` para garantizar
    //    unicidad incluso si dos tenants comparten nombre. Si el nombre quedara
    //    vacío tras normalizar, usamos "tenant" como base.
    await queryRunner.query(`
      UPDATE "tenants"
      SET "slug" =
        NULLIF(
          regexp_replace(
            regexp_replace(lower(trim("nombre")), '[^a-z0-9]+', '-', 'g'),
            '(^-+|-+$)', '', 'g'
          ),
          ''
        )
      WHERE "slug" IS NULL
    `);

    // Asegurar base no nula antes de sufijar.
    await queryRunner.query(`
      UPDATE "tenants"
      SET "slug" = 'tenant'
      WHERE "slug" IS NULL OR "slug" = ''
    `);

    // Sufijo de unicidad con los primeros 8 chars del id.
    await queryRunner.query(`
      UPDATE "tenants"
      SET "slug" = "slug" || '-' || substr("id"::text, 1, 8)
    `);

    // 3. Imponer NOT NULL ahora que todas las filas tienen valor.
    await queryRunner.query(`
      ALTER TABLE "tenants" ALTER COLUMN "slug" SET NOT NULL
    `);

    // 4. Crear el constraint UNIQUE sobre slug.
    await queryRunner.query(`
      ALTER TABLE "tenants"
        ADD CONSTRAINT "uq_tenants_slug" UNIQUE ("slug")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Revertir en orden inverso: quitar constraint y luego la columna.
    await queryRunner.query(`
      ALTER TABLE "tenants" DROP CONSTRAINT "uq_tenants_slug"
    `);

    await queryRunner.query(`
      ALTER TABLE "tenants" DROP COLUMN "slug"
    `);
  }
}
