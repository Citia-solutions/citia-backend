import { randomUUID } from 'node:crypto';

import {
  ConfiguracionRecordatorioRepositoryEnMemoria,
  LectorCitasEnMemoria,
  RecordatorioRepositoryEnMemoria,
  citaLeida,
} from '../../../../test/support/recordatorios-en-memoria';
import { EventoEntregado } from '../../../shared/application/suscriptor-eventos';
import { CitaLeida } from '../domain/lector-citas';
import { ParametrosPlanificacion } from '../domain/planificacion';
import {
  CanalRecordatorio,
  EstadoRecordatorio,
  MotivoRecordatorio,
} from '../domain/recordatorio.entity';
import { DatosRecordatorio } from '../domain/recordatorio.repository';
import { EventoRecordatorioInvalidoError } from './evento-recordatorio-invalido.error';
import { ReconciliarRecordatoriosService } from './reconciliar-recordatorios.service';
import {
  CONFIGURACION_RECORDATORIO_ACTUALIZADA,
  SuscriptorRecordatorios,
} from './suscriptor-recordatorios';
import { TransaccionRequeridaError } from './transaccion-requerida.error';

/**
 * Suscriptor + reconciliación (ADR-13 §6, ADR-12 §4) con los dobles en
 * memoria de los cuatro puertos (`test/support/recordatorios-en-memoria.ts`).
 */
const PARAMETROS: ParametrosPlanificacion = {
  tz: 'America/Santiago',
  silencio: { desde: '21:00', hasta: '08:00' },
  margenMinimoMin: 30,
  antelacionMinimaTardiaMin: 60,
};
const d = (iso: string): Date => new Date(iso);
const AHORA = d('2026-10-10T12:00:00Z');
// Miércoles 2026-10-14 15:00 en Santiago.
const INICIO = d('2026-10-14T18:00:00Z');

describe('SuscriptorRecordatorios', () => {
  const tenantId = randomUUID();
  const dueno = randomUUID(); // profesional dueño de la cita
  const solicitante = randomUUID(); // quien hizo la petición (colega)

  let recordatorios: RecordatorioRepositoryEnMemoria;
  let configuraciones: ConfiguracionRecordatorioRepositoryEnMemoria;
  let lector: LectorCitasEnMemoria;
  let servicio: ReconciliarRecordatoriosService;
  let suscriptor: SuscriptorRecordatorios;
  let cita: CitaLeida;
  let reloj: Date;
  const tx = { tx: 'del-despachador' };

  beforeEach(() => {
    recordatorios = new RecordatorioRepositoryEnMemoria(() => reloj);
    configuraciones = new ConfiguracionRecordatorioRepositoryEnMemoria();
    lector = new LectorCitasEnMemoria(recordatorios);
    reloj = AHORA;
    servicio = new ReconciliarRecordatoriosService(
      recordatorios,
      configuraciones,
      lector,
      { parametros: PARAMETROS, antelacionesPredeterminadasMin: [1440, 120] },
      () => reloj,
    );
    suscriptor = new SuscriptorRecordatorios(servicio);
    cita = lector.sembrarCita(
      citaLeida({ tenantId, usuarioId: dueno, inicio: INICIO }),
    );
  });

  function hecho(
    nombre: string,
    payload: Record<string, unknown> = {},
  ): EventoEntregado {
    return {
      id: randomUUID(),
      nombre,
      tenantId,
      ocurridoEn: reloj,
      payload: { citaId: cita.id, usuarioId: solicitante, ...payload },
    };
  }

  const deLaCita = (): DatosRecordatorio[] =>
    recordatorios.todos().filter((r) => r.citaId === cita.id);
  const vivos = (): DatosRecordatorio[] =>
    deLaCita().filter((r) => r.estado !== EstadoRecordatorio.CANCELADO);

  it('escucha los hechos de cita y el de configuración, no los de solicitud', () => {
    // Assert
    expect(suscriptor.eventos).toEqual([
      'CitaCreada',
      'CitaReagendada',
      'CitaCancelada',
      'CitaAsistida',
      'CitaNoAsistida',
      'CitaConfirmada',
      'CitaEditada',
      'ConfiguracionRecordatorioActualizada',
    ]);
    expect(suscriptor.eventos).not.toContain('SolicitudCitaAceptada');
  });

  describe('CitaCreada', () => {
    it('programa los recordatorios de la configuración predeterminada (24 h y 2 h)', async () => {
      // Act
      await suscriptor.manejar(hecho('CitaCreada'), tx);

      // Assert
      expect(
        deLaCita().map((r) => [
          r.antelacionMin,
          r.estado,
          r.programadoPara,
          r.tenantId,
        ]),
      ).toEqual([
        [
          1440,
          EstadoRecordatorio.PROGRAMADO,
          d('2026-10-13T18:00:00Z'),
          tenantId,
        ],
        [
          120,
          EstadoRecordatorio.PROGRAMADO,
          d('2026-10-14T16:00:00Z'),
          tenantId,
        ],
      ]);
      expect(deLaCita().every((r) => r.canal === CanalRecordatorio.EMAIL)).toBe(
        true,
      );
    });

    it('reconciliar dos (o tres) veces no cambia nada', async () => {
      // Arrange
      await suscriptor.manejar(hecho('CitaCreada'), tx);
      const antes = recordatorios.todos();
      const insertar = jest.spyOn(recordatorios, 'insertarSiNoExisten');
      const anular = jest.spyOn(recordatorios, 'anular');

      // Act
      await suscriptor.manejar(hecho('CitaCreada'), tx);
      reloj = d('2026-10-11T12:00:00Z');
      await suscriptor.manejar(hecho('CitaCreada'), tx);

      // Assert
      expect(recordatorios.todos()).toEqual(antes);
      expect(insertar).not.toHaveBeenCalled();
      expect(anular).not.toHaveBeenCalled();
    });

    it('usa la configuración del DUEÑO de la cita (cita.usuarioId), no la del usuarioId del payload', async () => {
      // Arrange
      configuraciones.sembrar({
        tenantId,
        usuarioId: dueno,
        activo: true,
        canal: CanalRecordatorio.EMAIL,
        antelacionesMin: [2880],
        telefonoContacto: null,
        correoRespuesta: null,
      });
      configuraciones.sembrar({
        tenantId,
        usuarioId: solicitante,
        activo: false,
        canal: CanalRecordatorio.EMAIL,
        antelacionesMin: [60],
        telefonoContacto: null,
        correoRespuesta: null,
      });
      const obtener = jest.spyOn(configuraciones, 'obtener');

      // Act
      await suscriptor.manejar(
        hecho('CitaCreada', { usuarioId: solicitante }),
        tx,
      );

      // Assert
      expect(obtener).toHaveBeenCalledWith(tenantId, dueno, tx);
      expect(obtener).not.toHaveBeenCalledWith(
        tenantId,
        solicitante,
        expect.anything(),
      );
      expect(deLaCita().map((r) => r.antelacionMin)).toEqual([2880]);
    });

    it('una cita de otro tenant no se toca', async () => {
      // Act
      await suscriptor.manejar(
        { ...hecho('CitaCreada'), tenantId: randomUUID() },
        tx,
      );

      // Assert
      expect(recordatorios.todos()).toEqual([]);
    });
  });

  describe('CitaReagendada', () => {
    it('anula los del inicio anterior (reprogramado) y programa los del nuevo', async () => {
      // Arrange
      await suscriptor.manejar(hecho('CitaCreada'), tx);
      const anteriores = deLaCita().map((r) => r.id);
      const nuevoInicio = d('2026-10-15T18:00:00Z');
      lector.actualizarCita(cita.id, { inicio: nuevoInicio });

      // Act
      await suscriptor.manejar(
        hecho('CitaReagendada', {
          inicio: nuevoInicio,
          inicioAnterior: INICIO,
        }),
        tx,
      );

      // Assert
      const anulados = deLaCita().filter((r) => anteriores.includes(r.id));
      expect(anulados.map((r) => [r.estado, r.motivo])).toEqual([
        [EstadoRecordatorio.CANCELADO, MotivoRecordatorio.REPROGRAMADO],
        [EstadoRecordatorio.CANCELADO, MotivoRecordatorio.REPROGRAMADO],
      ]);
      expect(
        vivos().map((r) => [r.antelacionMin, r.inicioCita, r.estado]),
      ).toEqual([
        [1440, nuevoInicio, EstadoRecordatorio.PROGRAMADO],
        [120, nuevoInicio, EstadoRecordatorio.PROGRAMADO],
      ]);
    });

    it('no aplica deltas: un CitaReagendada viejo que llega tarde reconcilia contra la hora ACTUAL', async () => {
      // Arrange — la cita se movió dos veces; el primer hecho llega al final
      await suscriptor.manejar(hecho('CitaCreada'), tx);
      lector.actualizarCita(cita.id, { inicio: d('2026-10-16T18:00:00Z') });
      await suscriptor.manejar(hecho('CitaReagendada'), tx);
      const despues = recordatorios.todos();

      // Act — hecho atrasado con el inicio intermedio en el payload
      await suscriptor.manejar(
        hecho('CitaReagendada', { inicio: d('2026-10-15T18:00:00Z') }),
        tx,
      );

      // Assert
      expect(recordatorios.todos()).toEqual(despues);
    });

    it('volver a la hora original reinserta: los cancelados no bloquean la clave', async () => {
      // Arrange
      await suscriptor.manejar(hecho('CitaCreada'), tx);
      lector.actualizarCita(cita.id, { inicio: d('2026-10-15T18:00:00Z') });
      await suscriptor.manejar(hecho('CitaReagendada'), tx);
      lector.actualizarCita(cita.id, { inicio: INICIO });

      // Act
      await suscriptor.manejar(hecho('CitaReagendada'), tx);

      // Assert
      expect(vivos().map((r) => r.inicioCita)).toEqual([INICIO, INICIO]);
      expect(deLaCita()).toHaveLength(6);
    });
  });

  describe.each(['CitaCancelada', 'CitaAsistida', 'CitaNoAsistida'])(
    '%s',
    (nombre) => {
      it('anula los programados (cita_terminal) y deja los ya enviados', async () => {
        // Arrange
        await suscriptor.manejar(hecho('CitaCreada'), tx);
        const [r24] = deLaCita();
        await recordatorios.registrarEnvio(
          r24.id,
          tenantId,
          { proveedor: 'registro', proveedorMensajeId: 'm-1' },
          d('2026-10-13T18:00:00Z'),
          tx,
        );
        const estado =
          nombre === 'CitaCancelada'
            ? 'cancelada'
            : nombre === 'CitaAsistida'
              ? 'asistio'
              : 'no_asistio';
        lector.actualizarCita(cita.id, { estado });

        // Act
        await suscriptor.manejar(hecho(nombre), tx);

        // Assert
        expect(
          deLaCita().map((r) => [r.antelacionMin, r.estado, r.motivo]),
        ).toEqual([
          [1440, EstadoRecordatorio.ENVIADO, null],
          [120, EstadoRecordatorio.CANCELADO, MotivoRecordatorio.CITA_TERMINAL],
        ]);
      });
    },
  );

  describe.each(['CitaEditada', 'CitaConfirmada'])('%s', (nombre) => {
    it('no toca nada si la cita ya estaba reconciliada', async () => {
      // Arrange
      await suscriptor.manejar(hecho('CitaCreada'), tx);
      lector.actualizarCita(cita.id, {
        estado: nombre === 'CitaConfirmada' ? 'confirmada' : 'pendiente',
      });
      const antes = recordatorios.todos();
      const insertar = jest.spyOn(recordatorios, 'insertarSiNoExisten');
      const anular = jest.spyOn(recordatorios, 'anular');

      // Act
      await suscriptor.manejar(hecho(nombre), tx);

      // Assert
      expect(recordatorios.todos()).toEqual(antes);
      expect(insertar).not.toHaveBeenCalled();
      expect(anular).not.toHaveBeenCalled();
    });
  });

  describe('ConfiguracionRecordatorioActualizada', () => {
    let otraFutura: CitaLeida;
    let cancelada: CitaLeida;
    let pasada: CitaLeida;

    beforeEach(async () => {
      otraFutura = lector.sembrarCita(
        citaLeida({
          tenantId,
          usuarioId: dueno,
          inicio: d('2026-10-16T14:00:00Z'),
        }),
      );
      cancelada = lector.sembrarCita(
        citaLeida({
          tenantId,
          usuarioId: dueno,
          inicio: d('2026-10-17T14:00:00Z'),
          estado: 'cancelada',
        }),
      );
      pasada = lector.sembrarCita(
        citaLeida({
          tenantId,
          usuarioId: dueno,
          inicio: d('2026-10-09T14:00:00Z'),
        }),
      );
      await suscriptor.manejar(hecho('CitaCreada'), tx);
      await suscriptor.manejar(
        hecho('CitaCreada', { citaId: otraFutura.id }),
        tx,
      );
    });

    function guardarConfiguracion(
      activo: boolean,
      antelacionesMin: number[],
    ): void {
      configuraciones.sembrar({
        tenantId,
        usuarioId: dueno,
        activo,
        canal: CanalRecordatorio.EMAIL,
        antelacionesMin,
        telefonoContacto: null,
        correoRespuesta: null,
      });
    }

    const configuracionActualizada = (): EventoEntregado => ({
      id: randomUUID(),
      nombre: CONFIGURACION_RECORDATORIO_ACTUALIZADA,
      tenantId,
      ocurridoEn: reloj,
      payload: { usuarioId: dueno },
    });

    it('cambiar los momentos reprograma las citas futuras vigentes del profesional', async () => {
      // Arrange
      guardarConfiguracion(true, [60]);

      // Act
      await suscriptor.manejar(configuracionActualizada(), tx);

      // Assert
      const vivosDe = (citaId: string) =>
        recordatorios
          .todos()
          .filter(
            (r) =>
              r.citaId === citaId && r.estado !== EstadoRecordatorio.CANCELADO,
          )
          .map((r) => r.antelacionMin);
      expect(vivosDe(cita.id)).toEqual([60]);
      expect(vivosDe(otraFutura.id)).toEqual([60]);
      expect(
        recordatorios
          .todos()
          .filter((r) => r.estado === EstadoRecordatorio.CANCELADO)
          .every((r) => r.motivo === MotivoRecordatorio.REPROGRAMADO),
      ).toBe(true);
      expect(recordatorios.todos().some((r) => r.citaId === cancelada.id)).toBe(
        false,
      );
      expect(recordatorios.todos().some((r) => r.citaId === pasada.id)).toBe(
        false,
      );
    });

    it('apagarla anula los programados de sus citas futuras (desactivado)', async () => {
      // Arrange
      guardarConfiguracion(false, [1440, 120]);

      // Act
      await suscriptor.manejar(configuracionActualizada(), tx);

      // Assert
      expect(recordatorios.todos()).toHaveLength(4);
      expect(
        recordatorios
          .todos()
          .every(
            (r) =>
              r.estado === EstadoRecordatorio.CANCELADO &&
              r.motivo === MotivoRecordatorio.DESACTIVADO,
          ),
      ).toBe(true);
    });

    it('volver a encenderla programa otra vez', async () => {
      // Arrange
      guardarConfiguracion(false, [1440, 120]);
      await suscriptor.manejar(configuracionActualizada(), tx);
      guardarConfiguracion(true, [1440, 120]);

      // Act
      await suscriptor.manejar(configuracionActualizada(), tx);

      // Assert
      expect(vivos()).toHaveLength(2);
    });
  });

  describe('orden y transacción (ADR-13 §6, ADR-12 §4 regla 3)', () => {
    it('candado → cita → configuración → existentes → anular → insertar, todo con el tx recibido', async () => {
      // Arrange — un reagendamiento anula e inserta
      await suscriptor.manejar(hecho('CitaCreada'), tx);
      lector.actualizarCita(cita.id, { inicio: d('2026-10-15T18:00:00Z') });
      const espias = {
        bloquear: jest.spyOn(recordatorios, 'bloquearCitaParaReconciliar'),
        obtenerCita: jest.spyOn(lector, 'obtenerCita'),
        configuracion: jest.spyOn(configuraciones, 'obtener'),
        existentes: jest.spyOn(recordatorios, 'listarVigentesDeCita'),
        anular: jest.spyOn(recordatorios, 'anular'),
        insertar: jest.spyOn(recordatorios, 'insertarSiNoExisten'),
      };
      const otroTx = { tx: 'otro' };

      // Act
      await suscriptor.manejar(hecho('CitaReagendada'), otroTx);

      // Assert
      const orden = Object.values(espias).map(
        (e) => e.mock.invocationCallOrder[0],
      );
      expect(orden).toEqual([...orden].sort((a, b) => a - b));
      for (const espia of Object.values(espias)) {
        expect(espia).toHaveBeenCalledTimes(1);
        expect(espia.mock.calls[0]).toContain(otroTx);
      }
      expect(espias.bloquear).toHaveBeenCalledWith(cita.id, otroTx);
    });

    it('sin transacción lanza TransaccionRequeridaError', async () => {
      // Act & Assert
      await expect(
        suscriptor.manejar(hecho('CitaCreada'), undefined),
      ).rejects.toThrow(TransaccionRequeridaError);
      expect(recordatorios.llamadas).toEqual([]);
    });
  });

  describe('hechos mal formados (errores con name significativo)', () => {
    it.each([
      ['CitaCreada sin citaId', hechoSin('CitaCreada', 'citaId'), 'citaId'],
      [
        'configuración sin usuarioId',
        hechoSin(CONFIGURACION_RECORDATORIO_ACTUALIZADA, 'usuarioId'),
        'usuarioId',
      ],
    ])('%s → EventoRecordatorioInvalidoError', async (_caso, evento, campo) => {
      // Act
      const error = await suscriptor
        .manejar(evento, tx)
        .then(() => null)
        .catch((e: unknown) => e);

      // Assert
      expect(error).toBeInstanceOf(EventoRecordatorioInvalidoError);
      expect((error as Error).name).toBe('EventoRecordatorioInvalidoError');
      expect((error as EventoRecordatorioInvalidoError).campo).toBe(campo);
    });

    it('sin tenantId → EventoRecordatorioInvalidoError', async () => {
      // Act & Assert
      await expect(
        suscriptor.manejar({ ...hecho('CitaCreada'), tenantId: '' }, tx),
      ).rejects.toMatchObject({
        name: 'EventoRecordatorioInvalidoError',
        campo: 'tenantId',
      });
    });

    function hechoSin(nombre: string, campo: string): EventoEntregado {
      return {
        id: randomUUID(),
        nombre,
        tenantId: randomUUID(),
        ocurridoEn: AHORA,
        payload: {
          citaId: randomUUID(),
          usuarioId: randomUUID(),
          [campo]: undefined,
        },
      };
    }
  });
});
