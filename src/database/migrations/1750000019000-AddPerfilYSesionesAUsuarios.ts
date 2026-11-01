import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * US-10 (plan `context/US/10-perfil-cuenta.md`, ADR-15 §1 y §5): perfil del
 * profesional y corte de sesiones al cambiar la contraseña.
 *
 * - `especialidad` VARCHAR(100) NULL: texto libre opcional (P1). `NULL` = sin
 *   especialidad; nunca vacía (`CHK_usuarios_especialidad_no_vacia`; `btrim`
 *   sin segundo argumento quita solo espacios: el dominio recorta antes).
 *   Solo se muestra en el perfil (ADR-15 §1).
 * - `sesiones_validas_desde` TIMESTAMPTZ NULL: corte de sesiones (P5, T2).
 *   `NULL` = sin corte: valen todos los tokens no vencidos. Solo la escribe el
 *   cambio de contraseña, truncada al segundo y con el reloj de la app (no el
 *   `now()` de la base): un token vale si `iat × 1000 ≥ sesiones_validas_desde`.
 * - **Sin relleno**: las filas existentes quedan con las dos columnas en
 *   `NULL`. Nadie pierde su sesión al migrar.
 * - Sin índice: la estrategia JWT lee el corte por la clave primaria.
 * - En Postgres 11+, `ADD COLUMN` sin default es solo metadatos.
 *
 * ⚠️ `down` (destructivo): borra el CHECK y las dos columnas. Se pierden las
 * especialidades guardadas, y los tokens emitidos antes de un cambio de
 * contraseña VUELVEN A VALER hasta vencer (como mucho `JWT_EXPIRES_IN`, 1 día).
 */
export class AddPerfilYSesionesAUsuarios1750000019000 implements MigrationInterface {
  name = 'AddPerfilYSesionesAUsuarios1750000019000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "usuarios" ADD COLUMN "especialidad" VARCHAR(100)
    `);

    await queryRunner.query(`
      ALTER TABLE "usuarios"
        ADD CONSTRAINT "CHK_usuarios_especialidad_no_vacia"
        CHECK ("especialidad" IS NULL OR btrim("especialidad") <> '')
    `);

    await queryRunner.query(`
      ALTER TABLE "usuarios" ADD COLUMN "sesiones_validas_desde" TIMESTAMPTZ
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Revertir en orden inverso.
    await queryRunner.query(`
      ALTER TABLE "usuarios"
        DROP CONSTRAINT "CHK_usuarios_especialidad_no_vacia"
    `);

    await queryRunner.query(`
      ALTER TABLE "usuarios" DROP COLUMN "sesiones_validas_desde"
    `);

    await queryRunner.query(`
      ALTER TABLE "usuarios" DROP COLUMN "especialidad"
    `);
  }
}
