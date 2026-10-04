import { randomUUID } from 'node:crypto';

import {
  ContadorTransacciones,
  PublicadorEnMemoria,
} from '../../../../test/support/in-memory-repositories';
import { ConfiguracionRecordatorioRepositoryEnMemoria } from '../../../../test/support/recordatorios-en-memoria';
import { ConfiguracionRecordatorioInvalidaError } from '../domain/exceptions/configuracion-recordatorio-invalida.error';
import { CanalRecordatorio } from '../domain/recordatorio.entity';
import { ConfiguracionRecordatoriosService } from './configuracion-recordatorios.service';

const AHORA = new Date('2026-10-10T15:00:00Z');

describe('ConfiguracionRecordatoriosService (ADR-13 §3, §17)', () => {
  let transacciones: ContadorTransacciones;
  let configuraciones: ConfiguracionRecordatorioRepositoryEnMemoria;
  let eventos: PublicadorEnMemoria;
  let servicio: ConfiguracionRecordatoriosService;
  const profesional = { tenantId: randomUUID(), usuarioId: randomUUID() };

  beforeEach(() => {
    transacciones = new ContadorTransacciones();
    configuraciones = new ConfiguracionRecordatorioRepositoryEnMemoria();
    eventos = new PublicadorEnMemoria();
    servicio = new ConfiguracionRecordatoriosService(
      transacciones,
      configuraciones,
      eventos,
      [1440, 120],
      () => AHORA,
    );
  });

  describe('obtener', () => {
    it('sin fila, la predeterminada (activa, 24 h y 2 h) sin crearla, dentro de una transacción', async () => {
      // Act
      const c = await servicio.obtener(profesional);

      // Assert
      expect(c).toMatchObject({
        esPredeterminada: true,
        activo: true,
        canal: CanalRecordatorio.EMAIL,
        antelacionesMin: [1440, 120],
        telefonoContacto: null,
        correoRespuesta: null,
      });
      expect(configuraciones.llamadas).toEqual([
        { operacion: 'obtener', tx: { tx: 1 } },
      ]);
    });

    it('con fila, la guardada del profesional del token', async () => {
      // Arrange
      configuraciones.sembrar({
        ...profesional,
        activo: false,
        canal: CanalRecordatorio.EMAIL,
        antelacionesMin: [2880],
        telefonoContacto: '+56 9',
        correoRespuesta: null,
      });

      // Act
      const c = await servicio.obtener(profesional);

      // Assert
      expect(c).toMatchObject({
        esPredeterminada: false,
        activo: false,
        antelacionesMin: [2880],
      });
    });

    it('no ve la de otro profesional ni la de otro tenant', async () => {
      // Arrange
      configuraciones.sembrar({
        tenantId: randomUUID(),
        usuarioId: profesional.usuarioId,
        activo: false,
        canal: CanalRecordatorio.EMAIL,
        antelacionesMin: [60],
        telefonoContacto: null,
        correoRespuesta: null,
      });

      // Act & Assert
      expect((await servicio.obtener(profesional)).esPredeterminada).toBe(true);
    });
  });

  describe('guardar', () => {
    it('guarda (normalizada) y publica ConfiguracionRecordatorioActualizada en la MISMA transacción', async () => {
      // Act
      const c = await servicio.guardar(profesional, {
        activo: true,
        antelacionesMin: [120, 2880],
        telefonoContacto: '  +56 9 1111 1111 ',
        correoRespuesta: ' Consulta@Ana.CL ',
      });

      // Assert
      expect(c).toMatchObject({
        esPredeterminada: false,
        antelacionesMin: [2880, 120],
        telefonoContacto: '+56 9 1111 1111',
        correoRespuesta: 'consulta@ana.cl',
      });
      expect(transacciones.abiertas).toBe(1);
      const guardar = configuraciones.llamadas.find(
        (l) => l.operacion === 'guardar',
      );
      expect(eventos.eventos).toEqual([
        {
          nombre: 'ConfiguracionRecordatorioActualizada',
          ocurridoEn: AHORA,
          tenantId: profesional.tenantId,
          payload: { usuarioId: profesional.usuarioId },
        },
      ]);
      expect(eventos.contextos[0]).toBe(guardar?.tx);
    });

    it('el hecho lleva solo ids: ni teléfono ni correo', async () => {
      // Act
      await servicio.guardar(profesional, {
        activo: true,
        antelacionesMin: [120],
        telefonoContacto: '+56 9 1111 1111',
        correoRespuesta: 'consulta@ana.cl',
      });

      // Assert
      const texto = JSON.stringify(eventos.eventos);
      expect(texto).not.toContain('1111');
      expect(texto).not.toContain('consulta@');
    });

    it('PUT completo: lo que no viaja queda vacío', async () => {
      // Arrange
      await servicio.guardar(profesional, {
        activo: true,
        antelacionesMin: [120],
        telefonoContacto: '+56 9',
        correoRespuesta: 'a@b.cl',
      });

      // Act
      const c = await servicio.guardar(profesional, {
        activo: false,
        antelacionesMin: [60],
      });

      // Assert
      expect(c).toMatchObject({
        activo: false,
        telefonoContacto: null,
        correoRespuesta: null,
      });
    });

    it('reglas inválidas → ConfiguracionRecordatorioInvalidaError, sin abrir transacción ni publicar', async () => {
      // Act & Assert
      await expect(
        servicio.guardar(profesional, {
          activo: true,
          antelacionesMin: [120, 120],
        }),
      ).rejects.toBeInstanceOf(ConfiguracionRecordatorioInvalidaError);
      expect(transacciones.abiertas).toBe(0);
      expect(eventos.eventos).toEqual([]);
    });
  });
});
