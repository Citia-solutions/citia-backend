import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * US-07.01 (H3, plan `context/US/07.01-registro-hechos.md`): quién PIDIÓ cada
 * cancelación o reagendamiento, que no siempre es quien lo hizo (`actor_tipo`).
 *
 * - `pedido_por` (`paciente` | `profesional`), NULL. Vacío = sin dato = cuenta
 *   como del profesional, a favor del paciente.
 * - **Sin relleno** (H12): la bitácora es append-only y no se reescribe. Lo
 *   que el paciente canceló por su enlace antes de US-07.01 se reconoce por
 *   `actor_tipo = 'paciente'`.
 *
 * Restricciones (el dominio las repite en `CambioCita.registrar`):
 * - `CHK_cambios_cita_pedido_por`: solo tiene sentido en una cancelación o un
 *   reagendamiento.
 * - `CHK_cambios_cita_pedido_por_paciente`: el paciente, por su enlace, nunca
 *   actúa "por decisión del profesional". Vacío se acepta (filas anteriores).
 *
 * Los CHECK comparan con literales, sin castear al tipo enum por nombre.
 *
 * ⚠️ `down` (destructivo): borra la columna y el tipo. Se pierde el dato de
 * quién pidió cada cambio desde el despliegue; no se puede reconstruir.
 */
export class AddPedidoPorACambiosCita1750000016000 implements MigrationInterface {
  name = 'AddPedidoPorACambiosCita1750000016000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "public"."enum_cambios_cita_pedido_por" AS ENUM(
        'paciente',
        'profesional'
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "cambios_cita"
        ADD COLUMN "pedido_por" "public"."enum_cambios_cita_pedido_por"
    `);

    await queryRunner.query(`
      ALTER TABLE "cambios_cita"
        ADD CONSTRAINT "CHK_cambios_cita_pedido_por"
        CHECK ("pedido_por" IS NULL OR "tipo" IN ('cancelada', 'reagendada'))
    `);

    await queryRunner.query(`
      ALTER TABLE "cambios_cita"
        ADD CONSTRAINT "CHK_cambios_cita_pedido_por_paciente"
        CHECK ("actor_tipo" <> 'paciente' OR "pedido_por" IS NULL OR "pedido_por" = 'paciente')
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Revertir en orden inverso.
    await queryRunner.query(`
      ALTER TABLE "cambios_cita"
        DROP CONSTRAINT "CHK_cambios_cita_pedido_por_paciente"
    `);

    await queryRunner.query(`
      ALTER TABLE "cambios_cita"
        DROP CONSTRAINT "CHK_cambios_cita_pedido_por"
    `);

    await queryRunner.query(`
      ALTER TABLE "cambios_cita" DROP COLUMN "pedido_por"
    `);

    await queryRunner.query(`
      DROP TYPE "public"."enum_cambios_cita_pedido_por"
    `);
  }
}
