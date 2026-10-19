import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * US-07.01 (H4, plan `context/US/07.01-registro-hechos.md`): de dónde salió
 * cada cita, `manual` o `solicitud_publica`.
 *
 * - `origen` NOT NULL DEFAULT `'manual'`. El código lo fija al crear (es
 *   obligatorio en `CrearCitaProps`); el DEFAULT se queda a propósito: cubre la
 *   ventana del despliegue (esta migración corre antes que la app nueva y la
 *   vieja sigue creando citas sin `origen`), los INSERT a mano de los tests y
 *   el seed. En Postgres 11+, `ADD COLUMN` con un default constante es solo
 *   metadatos.
 * - **Relleno**: `solicitud_publica` solo para las citas que CREÓ una
 *   solicitud `nueva` aceptada. Una de `reagendamiento` aceptada también llena
 *   `cita_id`, pero con su cita de ORIGEN (`cita_id = cita_origen_id`, ADR-10
 *   R2): esa cita no nació de la solicitud y queda `manual`. El filtro por
 *   `tenant_id` es defensa en profundidad (`cita_id` no tiene FK, ADR-09).
 *   Idempotente: si en la ventana del despliegue se aceptó una solicitud y su
 *   cita quedó `manual`, se corrige volviendo a correr el mismo UPDATE.
 *   El UPDATE no toca `actualizado_en` (lo maneja TypeORM, no un trigger).
 *
 * El tipo enum se crea y se usa en el mismo lote sin problema: la
 * restricción de `ALTER TYPE … ADD VALUE` (ver 1750000013000) no aplica a
 * `CREATE TYPE`.
 *
 * ⚠️ `down` (destructivo): borra la columna y el tipo. Se pierde el origen de
 * las citas creadas desde el despliegue; el de las anteriores se puede volver
 * a derivar con el UPDATE del relleno.
 */
export class AddOrigenACitas1750000015000 implements MigrationInterface {
  name = 'AddOrigenACitas1750000015000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "public"."enum_citas_origen" AS ENUM(
        'manual',
        'solicitud_publica'
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "citas"
        ADD COLUMN "origen" "public"."enum_citas_origen" NOT NULL DEFAULT 'manual'
    `);

    // Relleno: solo las citas que creó una solicitud pública `nueva` aceptada.
    await queryRunner.query(`
      UPDATE "citas" AS c
         SET "origen" = 'solicitud_publica'
       WHERE EXISTS (
               SELECT 1
                 FROM "solicitudes_cita" AS s
                WHERE s."cita_id"   = c."id"
                  AND s."tenant_id" = c."tenant_id"
                  AND s."tipo"      = 'nueva'
                  AND s."estado"    = 'aceptada'
             )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Revertir en orden inverso.
    await queryRunner.query(`
      ALTER TABLE "citas" DROP COLUMN "origen"
    `);

    await queryRunner.query(`
      DROP TYPE "public"."enum_citas_origen"
    `);
  }
}
