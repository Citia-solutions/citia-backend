import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { getMetadataArgsStorage } from 'typeorm';

import {
  CHECKS_MENSAJES_SOPORTE,
  MensajeSoporteOrmEntity,
  PREDICADO_PENDIENTES,
} from './mensaje-soporte.orm-entity';

/**
 * La entidad (esquemas con `synchronize` en tests) debe declarar los mismos
 * CHECK e índices que la migración 1750000020000, escrita a mano. Si alguien
 * cambia uno de los dos lados, esto falla.
 */
describe('MensajeSoporteOrmEntity', () => {
  const normalizar = (sql: string) => sql.replace(/\s+/g, ' ').trim();
  const migracion = normalizar(
    readFileSync(
      join(
        __dirname,
        '../../../../database/migrations/1750000020000-CreateMensajesSoporte.ts',
      ),
      'utf8',
    ),
  );
  const metadatos = getMetadataArgsStorage();

  describe('CHECK', () => {
    it('debería declarar exactamente los cinco CHECK de la migración', () => {
      // Arrange
      const declarados = metadatos.checks
        .filter((c) => c.target === MensajeSoporteOrmEntity)
        .map((c) => c.name)
        .sort();
      const deLaMigracion = [
        ...migracion.matchAll(/CONSTRAINT "(CHK_mensajes_soporte_\w+)"/g),
      ]
        .map((m) => m[1])
        .sort();

      // Assert
      expect(declarados).toEqual(Object.keys(CHECKS_MENSAJES_SOPORTE).sort());
      expect(deLaMigracion).toEqual(declarados);
    });

    it.each(Object.entries(CHECKS_MENSAJES_SOPORTE))(
      '%s debería decir lo mismo en la entidad y en la migración',
      (nombre, expresion) => {
        // Arrange
        const check = metadatos.checks.find(
          (c) => c.target === MensajeSoporteOrmEntity && c.name === nombre,
        );

        // Assert
        expect(check?.expression).toBe(expresion);
        expect(migracion).toContain(
          `CONSTRAINT "${nombre}" CHECK (${expresion})`,
        );
      },
    );
  });

  describe('índices', () => {
    const indice = (nombre: string) =>
      metadatos.indices.find(
        (i) => i.target === MensajeSoporteOrmEntity && i.name === nombre,
      );

    it('idx_mensajes_soporte_pendientes: parcial sobre proximo_intento_en de las pendientes', () => {
      // Assert
      expect(indice('idx_mensajes_soporte_pendientes')).toEqual(
        expect.objectContaining({
          columns: ['proximoIntentoEn'],
          where: PREDICADO_PENDIENTES,
        }),
      );
      expect(migracion).toContain(
        `CREATE INDEX "idx_mensajes_soporte_pendientes" ON "mensajes_soporte" ("proximo_intento_en") WHERE ${PREDICADO_PENDIENTES}`,
      );
    });

    it('idx_mensajes_soporte_tenant_creado: por tenant y creado_en, sin predicado', () => {
      // Assert
      const declarado = indice('idx_mensajes_soporte_tenant_creado');
      expect(declarado?.columns).toEqual(['tenantId', 'creadoEn']);
      expect(declarado?.where).toBeUndefined();
      expect(migracion).toContain(
        'CREATE INDEX "idx_mensajes_soporte_tenant_creado" ON "mensajes_soporte" ("tenant_id", "creado_en")',
      );
    });
  });

  describe('columnas de fecha', () => {
    it.each(['proximoIntentoEn', 'enviadoEn', 'creadoEn'])(
      '%s debería declarar timestamptz (DT-46)',
      (propiedad) => {
        const columna = metadatos.columns.find(
          (c) =>
            c.target === MensajeSoporteOrmEntity &&
            c.propertyName === propiedad,
        );
        expect(columna?.options.type).toBe('timestamptz');
      },
    );
  });

  describe('PK y FK con los nombres de la migración', () => {
    it('la PK y las dos FK (RESTRICT / CASCADE)', () => {
      // Arrange
      const pk = metadatos.columns.find(
        (c) => c.target === MensajeSoporteOrmEntity && c.propertyName === 'id',
      );
      const unionDe = (propiedad: string) =>
        metadatos.joinColumns.find(
          (j) =>
            j.target === MensajeSoporteOrmEntity &&
            j.propertyName === propiedad,
        );
      const relacionDe = (propiedad: string) =>
        metadatos.relations.find(
          (r) =>
            r.target === MensajeSoporteOrmEntity &&
            r.propertyName === propiedad,
        );

      // Assert
      expect(pk?.options.primaryKeyConstraintName).toBe(
        'PK_mensajes_soporte_id',
      );
      expect(unionDe('tenant')?.foreignKeyConstraintName).toBe(
        'FK_mensajes_soporte_tenant_id',
      );
      expect(unionDe('usuario')?.foreignKeyConstraintName).toBe(
        'FK_mensajes_soporte_usuario_id',
      );
      for (const propiedad of ['tenant', 'usuario']) {
        expect(relacionDe(propiedad)?.options).toEqual(
          expect.objectContaining({
            onDelete: 'RESTRICT',
            onUpdate: 'CASCADE',
          }),
        );
      }
      expect(migracion).toContain(
        'CONSTRAINT "PK_mensajes_soporte_id" PRIMARY KEY ("id")',
      );
      expect(migracion).toContain(
        'CONSTRAINT "FK_mensajes_soporte_tenant_id" FOREIGN KEY ("tenant_id") REFERENCES "tenants" ("id") ON DELETE RESTRICT ON UPDATE CASCADE',
      );
      expect(migracion).toContain(
        'CONSTRAINT "FK_mensajes_soporte_usuario_id" FOREIGN KEY ("usuario_id") REFERENCES "usuarios" ("id") ON DELETE RESTRICT ON UPDATE CASCADE',
      );
    });
  });
});
