import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { getMetadataArgsStorage } from 'typeorm';

import {
  CHECK_ESPECIALIDAD_NO_VACIA,
  UsuarioOrmEntity,
} from './usuario.orm-entity';

/**
 * Las columnas y el CHECK de US-10 en la entidad (esquemas con `synchronize`
 * en tests) deben decir lo mismo que la migración 1750000019000, escrita a
 * mano.
 */
describe('UsuarioOrmEntity (US-10)', () => {
  const normalizar = (sql: string) => sql.replace(/\s+/g, ' ').trim();
  const migracion = normalizar(
    readFileSync(
      join(
        __dirname,
        '../../../../database/migrations/1750000019000-AddPerfilYSesionesAUsuarios.ts',
      ),
      'utf8',
    ),
  );
  const columna = (propiedad: string) =>
    getMetadataArgsStorage().columns.find(
      (c) => c.target === UsuarioOrmEntity && c.propertyName === propiedad,
    );

  it('el CHECK de la especialidad debería coincidir con el de la migración', () => {
    // Arrange
    const check = getMetadataArgsStorage().checks.find(
      (c) =>
        c.target === UsuarioOrmEntity &&
        c.name === 'CHK_usuarios_especialidad_no_vacia',
    );

    // Assert
    expect(check?.expression).toBe(CHECK_ESPECIALIDAD_NO_VACIA);
    expect(migracion).toContain(
      `ADD CONSTRAINT "CHK_usuarios_especialidad_no_vacia" CHECK (${CHECK_ESPECIALIDAD_NO_VACIA})`,
    );
  });

  it('especialidad: VARCHAR(100) NULL, como la migración', () => {
    // Assert
    expect(columna('especialidad')?.options).toEqual(
      expect.objectContaining({
        name: 'especialidad',
        type: 'varchar',
        length: 100,
        nullable: true,
      }),
    );
    expect(migracion).toContain(
      'ALTER TABLE "usuarios" ADD COLUMN "especialidad" VARCHAR(100)',
    );
  });

  it('sesiones_validas_desde: TIMESTAMPTZ NULL (declarado, DT-46), como la migración', () => {
    // Assert
    expect(columna('sesionesValidasDesde')?.options).toEqual(
      expect.objectContaining({
        name: 'sesiones_validas_desde',
        type: 'timestamptz',
        nullable: true,
      }),
    );
    expect(migracion).toContain(
      'ALTER TABLE "usuarios" ADD COLUMN "sesiones_validas_desde" TIMESTAMPTZ',
    );
  });
});
