import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  EstadoRecordatorio,
  MOTIVOS_POR_ESTADO,
  MotivoRecordatorio,
} from '../../domain/recordatorio.entity';
import { CHECK_MOTIVO_RECORDATORIO } from './recordatorio.orm-entity';

/**
 * El CHECK de la entidad (esquemas con `synchronize` en tests) debe decir lo
 * mismo que el de la migración 1750000010000, que está escrito a mano.
 */
describe('RecordatorioOrmEntity', () => {
  describe('vocabulario', () => {
    it('cada motivo debería pertenecer a un solo estado', () => {
      // Arrange
      const asignados = Object.values(MOTIVOS_POR_ESTADO).flat();

      // Assert
      expect([...asignados].sort()).toEqual(
        [...Object.values(MotivoRecordatorio)].sort(),
      );
      expect(new Set(asignados).size).toBe(asignados.length);
    });

    it('programado, enviado y entregado no deberían llevar motivo', () => {
      // Assert
      expect(MOTIVOS_POR_ESTADO[EstadoRecordatorio.PROGRAMADO]).toEqual([]);
      expect(MOTIVOS_POR_ESTADO[EstadoRecordatorio.ENVIADO]).toEqual([]);
      expect(MOTIVOS_POR_ESTADO[EstadoRecordatorio.ENTREGADO]).toEqual([]);
    });
  });

  describe('CHECK_MOTIVO_RECORDATORIO', () => {
    const normalizar = (sql: string) => sql.replace(/\s+/g, ' ').trim();

    it('debería coincidir con el CHECK escrito en la migración', () => {
      // Arrange — el texto REAL de la migración 1750000010000
      const migracion = readFileSync(
        join(
          __dirname,
          '../../../../database/migrations/1750000010000-CreateRecordatorios.ts',
        ),
        'utf8',
      );
      const check =
        /CONSTRAINT "CHK_recordatorios_motivo" CHECK \(([\s\S]*?)\),\s*CONSTRAINT "FK_recordatorios_cita_id"/.exec(
          migracion,
        );

      // Assert
      expect(check).not.toBeNull();
      expect(normalizar(CHECK_MOTIVO_RECORDATORIO)).toBe(
        normalizar(check?.[1] ?? ''),
      );
    });

    it('debería exigir motivo NO nulo en los estados con motivo', () => {
      // NULL IN (...) da NULL y un CHECK con NULL se da por cumplido.
      expect(
        CHECK_MOTIVO_RECORDATORIO.match(/"motivo" IS NOT NULL/g),
      ).toHaveLength(3);
    });
  });
});
