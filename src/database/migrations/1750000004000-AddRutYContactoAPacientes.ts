import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * ADR-09 decisiones 3 y 10:
 *
 *  - El RUT pasa a ser la identidad del paciente dentro de la organizacion.
 *    Es nullable porque el alta manual admite personas sin RUT; el indice
 *    unico es parcial para que varios pacientes sin RUT puedan convivir.
 *  - El contacto deja de ser un unico campo: el formulario recoge telefono y
 *    correo por separado. `contacto` se RENOMBRA a `telefono` para conservar
 *    los datos existentes, y `correo` se agrega nullable (en el alta manual el
 *    profesional puede no tenerlo; en el formulario publico es obligatorio y
 *    esa exigencia vive en el DTO, no en el esquema).
 */
export class AddRutYContactoAPacientes1750000004000 implements MigrationInterface {
  name = 'AddRutYContactoAPacientes1750000004000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // 1. contacto -> telefono (rename, no drop: conserva los datos).
    await queryRunner.query(`
      ALTER TABLE "pacientes" RENAME COLUMN "contacto" TO "telefono"
    `);

    // 2. Correo como segundo canal de contacto.
    await queryRunner.query(`
      ALTER TABLE "pacientes" ADD COLUMN "correo" VARCHAR
    `);

    // 3. RUT en forma canonica (sin puntos ni guion, verificador en minuscula).
    await queryRunner.query(`
      ALTER TABLE "pacientes" ADD COLUMN "rut" VARCHAR
    `);

    // 4. Un RUT identifica una persona dentro de una organizacion y no puede
    //    repetirse. Indice PARCIAL: solo aplica cuando hay RUT, de modo que
    //    los pacientes sin RUT (alta manual) no colisionan entre si.
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_paciente_tenant_rut"
        ON "pacientes" ("tenant_id", "rut")
        WHERE "rut" IS NOT NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Revertir en orden inverso.
    await queryRunner.query(`
      DROP INDEX "public"."uq_paciente_tenant_rut"
    `);

    await queryRunner.query(`
      ALTER TABLE "pacientes" DROP COLUMN "rut"
    `);

    await queryRunner.query(`
      ALTER TABLE "pacientes" DROP COLUMN "correo"
    `);

    await queryRunner.query(`
      ALTER TABLE "pacientes" RENAME COLUMN "telefono" TO "contacto"
    `);
  }
}
