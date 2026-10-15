import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fase 3, contrato §2.2: estado terminal `descartada` de una solicitud.
 *
 * Lo pone el sistema (no una persona) cuando la cita de origen de una solicitud
 * de reagendamiento `recibida` termina (cancelada, asistió, no asistió): ya no
 * hay nada que mover. Distinto de `rechazada`, que es una decisión del
 * profesional.
 *
 * ## Por qué va en su propia migración (y la transacción)
 *
 * En Postgres un valor agregado con `ALTER TYPE … ADD VALUE` dentro de una
 * transacción NO se puede USAR (insertar, comparar contra él, usarlo en un
 * índice parcial o un CHECK) hasta que esa transacción confirme
 * ("unsafe use of new value"). Agregarlo sí se puede (Postgres ≥ 12; el
 * proyecto usa 16).
 *
 * TypeORM 1.0 corre `migration:run` con `migrationsTransactionMode = 'all'`
 * (todas las pendientes en UNA transacción) y, en ese modo, PROHÍBE que una
 * migración declare `transaction = false` (`ForbiddenTransactionModeOverrideError`).
 * Por eso no se usa ese atajo: esta migración solo agrega el valor, y ninguna
 * migración de este lote lo usa (la 1750000014000 compara solo contra
 * `'recibida'`, que ya existía). El código de la aplicación lo usa recién
 * después del commit.
 *
 * ⚠️ Regla para el futuro: si una migración necesita USAR `'descartada'`
 * (backfill, índice parcial, CHECK) y puede correr en el mismo lote que esta,
 * hay que correr el lote con `--transaction each` (o cambiar
 * `migrationsTransactionMode` del data-source a `'each'`).
 *
 * ## Limitación del `down`
 *
 * Postgres no tiene `ALTER TYPE … DROP VALUE`. El `down` RECREA el tipo sin
 * `'descartada'` (renombra el actual, crea el anterior, convierte la columna
 * vía texto y borra el viejo). Si hay filas `descartada`, el tipo anterior no
 * puede representarlas: el `down` FALLA a propósito en vez de reescribirlas o
 * borrarlas en silencio. Para revertir igualmente hay que decidir a mano qué
 * hacer con ellas, p. ej.:
 *   UPDATE solicitudes_cita SET estado = 'rechazada' WHERE estado = 'descartada';
 * La conversión reconstruye los índices sobre `estado`; requiere que la
 * migración 1750000014000 ya esté revertida (su índice parcial compara
 * `estado` con una constante del tipo).
 */
export class AddDescartadaAEstadoSolicitudesCita1750000013000 implements MigrationInterface {
  name = 'AddDescartadaAEstadoSolicitudesCita1750000013000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE "public"."enum_solicitudes_cita_estado" ADD VALUE 'descartada'
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const [{ descartadas }] = (await queryRunner.query(`
      SELECT count(*)::int AS "descartadas"
        FROM "solicitudes_cita"
       WHERE "estado" = 'descartada'
    `)) as { descartadas: number }[];
    if (descartadas > 0) {
      throw new Error(
        `AddDescartadaAEstadoSolicitudesCita.down: hay ${descartadas} solicitud(es) 'descartada' que el tipo anterior no puede representar. ` +
          'Decide a mano qué hacer con ellas (ver el comentario de la migración) y vuelve a intentar.',
      );
    }

    await queryRunner.query(`
      ALTER TYPE "public"."enum_solicitudes_cita_estado"
        RENAME TO "enum_solicitudes_cita_estado_old"
    `);

    await queryRunner.query(`
      CREATE TYPE "public"."enum_solicitudes_cita_estado" AS ENUM(
        'recibida',
        'aceptada',
        'rechazada'
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "solicitudes_cita" ALTER COLUMN "estado" DROP DEFAULT
    `);

    await queryRunner.query(`
      ALTER TABLE "solicitudes_cita"
        ALTER COLUMN "estado" TYPE "public"."enum_solicitudes_cita_estado"
        USING "estado"::text::"public"."enum_solicitudes_cita_estado"
    `);

    await queryRunner.query(`
      ALTER TABLE "solicitudes_cita" ALTER COLUMN "estado" SET DEFAULT 'recibida'
    `);

    await queryRunner.query(`
      DROP TYPE "public"."enum_solicitudes_cita_estado_old"
    `);
  }
}
