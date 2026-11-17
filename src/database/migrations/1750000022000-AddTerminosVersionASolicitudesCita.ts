import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * US-11 (plan `context/US/11-terminos-paciente.md`, ADR-16 §5, D10): la
 * versión de los términos que el paciente aceptó al enviar el formulario
 * público. La fila de `aceptaciones_terminos` nace recién al aceptar la
 * solicitud en la bandeja (con `aceptada_en = recibida_en`); hasta entonces,
 * y para siempre en una rechazada, la prueba vive en esta columna. Así la
 * ruta anónima sigue con un solo `INSERT` y sin transacción (ADR-09 §8).
 *
 * - `terminos_version` VARCHAR(10), NULL: las filas existentes quedan en
 *   `NULL` (cumplen el CHECK). Sin relleno (D7).
 * - `CHK_solicitudes_cita_terminos_version`: solo una `nueva` con
 *   consentimiento la trae; las de `reagendamiento` (copian el consentimiento
 *   de la ficha), nunca.
 * - `tipo` es un enum con un nombre de tipo en la migración y otro en
 *   `synchronize`: el CHECK compara con un literal **sin cast**, que vale en
 *   los dos.
 * - La regex lleva la barra DOBLADA en este archivo (`\\.`) para que a
 *   Postgres le llegue `\.` (un punto literal).
 *
 * ⚠️ `down` (destructivo): `DROP CONSTRAINT` y `DROP COLUMN`. Se pierde la
 * versión que aceptaron los pacientes en las solicitudes que todavía no se
 * aceptaron (o que se rechazaron): esa prueba no está en ninguna otra tabla.
 */
export class AddTerminosVersionASolicitudesCita1750000022000 implements MigrationInterface {
  name = 'AddTerminosVersionASolicitudesCita1750000022000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "solicitudes_cita" ADD COLUMN "terminos_version" VARCHAR(10)
    `);

    // Solo una `nueva` con consentimiento la trae; las de reagendamiento, nunca.
    await queryRunner.query(`
      ALTER TABLE "solicitudes_cita"
        ADD CONSTRAINT "CHK_solicitudes_cita_terminos_version"
        CHECK ("terminos_version" IS NULL
               OR ("terminos_version" ~ '^[0-9]+\\.[0-9]+$'
                   AND "tipo" = 'nueva'
                   AND "consentimiento" = true))
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Revertir en orden inverso. ⚠️ Pierde la versión de las solicitudes.
    await queryRunner.query(`
      ALTER TABLE "solicitudes_cita"
        DROP CONSTRAINT "CHK_solicitudes_cita_terminos_version"
    `);

    await queryRunner.query(`
      ALTER TABLE "solicitudes_cita" DROP COLUMN "terminos_version"
    `);
  }
}
