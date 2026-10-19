import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * US-07.01 (H5, plan `context/US/07.01-registro-hechos.md`): la primera vez
 * que el paciente abre su enlace con un token válido.
 *
 * - `primera_apertura_en` TIMESTAMPTZ NULL. La escribe la app con su reloj
 *   (como `revocado_en`), una sola vez:
 *   `UPDATE … WHERE "primera_apertura_en" IS NULL`.
 * - Se guarda **por versión del enlace**: tras invalidar, el enlace nuevo
 *   empieza sin apertura.
 * - Sin índice: en US-07.01 nadie consulta por ella. Sin CHECK contra
 *   `emitido_en` (que sale del reloj de la base, no del de la app). No toca
 *   `CHK_enlaces_cita_revocacion`.
 *
 * ⚠️ `down` (destructivo): borra la columna; se pierden las aperturas
 * registradas.
 */
export class AddPrimeraAperturaAEnlacesCita1750000017000 implements MigrationInterface {
  name = 'AddPrimeraAperturaAEnlacesCita1750000017000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "enlaces_cita" ADD COLUMN "primera_apertura_en" TIMESTAMPTZ
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "enlaces_cita" DROP COLUMN "primera_apertura_en"
    `);
  }
}
