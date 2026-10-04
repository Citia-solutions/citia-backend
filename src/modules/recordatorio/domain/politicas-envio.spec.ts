import {
  ContextoEnvio,
  ParametrosPoliticasEnvio,
  PoliticaConfiguracionActiva,
  PoliticaConsentimiento,
  PoliticaCorreoPresente,
  PoliticaCuotaProveedor,
  PoliticaHorasSinEnvio,
  PoliticaLimiteTenant,
  PoliticaNoSuprimido,
  PoliticaVencimiento,
  PoliticaVigenciaCita,
  crearPoliticasEnvio,
  evaluarPoliticasEnvio,
} from './politicas-envio';
import { MotivoRecordatorio } from './recordatorio.entity';

const TZ = 'America/Santiago';
const SILENCIO = { desde: '21:00', hasta: '08:00' };
const d = (iso: string): Date => new Date(iso);

// Cita miércoles 2026-10-14 15:00 local (18:00Z); recordatorio de 2 h.
const INICIO = d('2026-10-14T18:00:00Z');

function contexto(cambios: Partial<ContextoEnvio> = {}): ContextoEnvio {
  return {
    ahora: d('2026-10-14T16:00:00Z'), // 13:00 local
    recordatorio: { inicioCita: INICIO, venceEn: d('2026-10-14T17:30:00Z') },
    cita: { inicio: INICIO, vigente: true },
    configuracion: { activo: true },
    correoPaciente: 'paciente@correo.cl',
    consentimientoPaciente: true,
    correoSuprimido: false,
    enviadosHoyTenant: 0,
    cuota: {
      enviadosDia: 0,
      enviadosMes: 0,
      reinicioDia: d('2026-10-15T00:00:00Z'),
      reinicioMes: d('2026-11-01T00:00:00Z'),
    },
    ...cambios,
  };
}

const PARAMETROS: ParametrosPoliticasEnvio = {
  tz: TZ,
  silencio: SILENCIO,
  exigirConsentimiento: false,
  maxDiarioPorTenant: 40,
  cuotaDiaria: 100,
  cuotaMensual: 3000,
};

describe('politicas-envio (ADR-13 §7)', () => {
  describe('1. vigencia de la cita', () => {
    const politica = new PoliticaVigenciaCita();

    it('continúa si existe, está vigente y su inicio es el del recordatorio', () => {
      expect(politica.evaluar(contexto())).toEqual({ tipo: 'continuar' });
    });

    it.each([
      ['no existe', null],
      ['no está vigente', { inicio: INICIO, vigente: false }],
    ])('cancela (cita_terminal) si %s', (_caso, cita) => {
      expect(politica.evaluar(contexto({ cita }))).toEqual({
        tipo: 'cancelar',
        motivo: MotivoRecordatorio.CITA_TERMINAL,
      });
    });

    it('cancela (reprogramado) si la cita se movió', () => {
      expect(
        politica.evaluar(
          contexto({
            cita: { inicio: d('2026-10-15T18:00:00Z'), vigente: true },
          }),
        ),
      ).toEqual({ tipo: 'cancelar', motivo: MotivoRecordatorio.REPROGRAMADO });
    });
  });

  describe('2. vencimiento', () => {
    const politica = new PoliticaVencimiento();

    it('continúa antes de venceEn', () => {
      expect(politica.evaluar(contexto())).toEqual({ tipo: 'continuar' });
    });

    it.each(['2026-10-14T17:30:00Z', '2026-10-14T17:31:00Z'])(
      'falla (vencido) en o después de venceEn (%s)',
      (ahora) => {
        expect(politica.evaluar(contexto({ ahora: d(ahora) }))).toEqual({
          tipo: 'fallar',
          motivo: MotivoRecordatorio.VENCIDO,
        });
      },
    );
  });

  describe('3. configuración activa', () => {
    const politica = new PoliticaConfiguracionActiva();

    it('continúa si está encendida', () => {
      expect(politica.evaluar(contexto())).toEqual({ tipo: 'continuar' });
    });

    it('cancela (desactivado) si el profesional la apagó', () => {
      expect(
        politica.evaluar(contexto({ configuracion: { activo: false } })),
      ).toEqual({ tipo: 'cancelar', motivo: MotivoRecordatorio.DESACTIVADO });
    });
  });

  describe('4. horas sin envío', () => {
    const politica = new PoliticaHorasSinEnvio(TZ, SILENCIO);

    it('continúa de día', () => {
      expect(politica.evaluar(contexto())).toEqual({ tipo: 'continuar' });
    });

    it('de noche pospone a las 08:00 si llega antes de venceEn', () => {
      // Arrange — 13-oct 23:00 local; el de 24 h de una cita del 15-oct vence tarde
      const ctx = contexto({
        ahora: d('2026-10-14T02:00:00Z'),
        recordatorio: {
          inicioCita: INICIO,
          venceEn: d('2026-10-14T16:00:00Z'),
        },
      });

      // Act & Assert
      expect(politica.evaluar(ctx)).toEqual({
        tipo: 'posponer',
        hasta: d('2026-10-14T11:00:00Z'),
      });
    });

    it('de noche falla (vencido) si a las 08:00 ya venció', () => {
      // Arrange
      const ctx = contexto({
        ahora: d('2026-10-14T02:00:00Z'),
        recordatorio: {
          inicioCita: INICIO,
          venceEn: d('2026-10-14T11:00:00Z'),
        },
      });

      // Act & Assert
      expect(politica.evaluar(ctx)).toEqual({
        tipo: 'fallar',
        motivo: MotivoRecordatorio.VENCIDO,
      });
    });
  });

  describe('5. correo presente', () => {
    const politica = new PoliticaCorreoPresente();

    it('continúa con correo', () => {
      expect(politica.evaluar(contexto())).toEqual({ tipo: 'continuar' });
    });

    it.each([null, '', '   '])(
      'omite (sin_correo) con %p',
      (correoPaciente) => {
        expect(politica.evaluar(contexto({ correoPaciente }))).toEqual({
          tipo: 'omitir',
          motivo: MotivoRecordatorio.SIN_CORREO,
        });
      },
    );
  });

  describe('6. no suprimido', () => {
    const politica = new PoliticaNoSuprimido();

    it('continúa si la dirección no está suprimida', () => {
      expect(politica.evaluar(contexto())).toEqual({ tipo: 'continuar' });
    });

    it('omite (correo_suprimido) si rebotó o se quejó antes', () => {
      expect(politica.evaluar(contexto({ correoSuprimido: true }))).toEqual({
        tipo: 'omitir',
        motivo: MotivoRecordatorio.CORREO_SUPRIMIDO,
      });
    });
  });

  describe('7. consentimiento (apagada por defecto, DT-16)', () => {
    it('apagada: continúa aunque el paciente no haya consentido', () => {
      expect(
        new PoliticaConsentimiento(false).evaluar(
          contexto({ consentimientoPaciente: false }),
        ),
      ).toEqual({ tipo: 'continuar' });
    });

    it('encendida: omite (sin_consentimiento) sin consentimiento', () => {
      expect(
        new PoliticaConsentimiento(true).evaluar(
          contexto({ consentimientoPaciente: false }),
        ),
      ).toEqual({
        tipo: 'omitir',
        motivo: MotivoRecordatorio.SIN_CONSENTIMIENTO,
      });
    });

    it('encendida: continúa con consentimiento', () => {
      expect(new PoliticaConsentimiento(true).evaluar(contexto())).toEqual({
        tipo: 'continuar',
      });
    });
  });

  describe('8. límite diario del tenant', () => {
    const politica = new PoliticaLimiteTenant(40);

    it('continúa por debajo del tope', () => {
      expect(politica.evaluar(contexto({ enviadosHoyTenant: 39 }))).toEqual({
        tipo: 'continuar',
      });
    });

    it('omite (limite_tenant) al llegar al tope', () => {
      expect(politica.evaluar(contexto({ enviadosHoyTenant: 40 }))).toEqual({
        tipo: 'omitir',
        motivo: MotivoRecordatorio.LIMITE_TENANT,
      });
    });
  });

  describe('9. cuota del proveedor', () => {
    const politica = new PoliticaCuotaProveedor(100, 3000);
    const cuota = contexto().cuota;

    it('continúa con cuota disponible', () => {
      expect(
        politica.evaluar(contexto({ cuota: { ...cuota, enviadosDia: 99 } })),
      ).toEqual({ tipo: 'continuar' });
    });

    it('cuota diaria agotada: pospone al reinicio si llega antes de venceEn', () => {
      // Arrange — el de 24 h de una cita del 16-oct vence el 15-oct
      const ctx = contexto({
        cuota: { ...cuota, enviadosDia: 100 },
        recordatorio: {
          inicioCita: INICIO,
          venceEn: d('2026-10-15T16:00:00Z'),
        },
      });

      // Act & Assert
      expect(politica.evaluar(ctx)).toEqual({
        tipo: 'posponer',
        hasta: cuota.reinicioDia,
      });
    });

    it('cuota diaria agotada y el reinicio llega tarde: falla (cuota_agotada)', () => {
      expect(
        politica.evaluar(contexto({ cuota: { ...cuota, enviadosDia: 100 } })),
      ).toEqual({ tipo: 'fallar', motivo: MotivoRecordatorio.CUOTA_AGOTADA });
    });

    it('con las dos agotadas manda el reinicio más tardío (el mensual)', () => {
      // Arrange
      const ctx = contexto({
        cuota: { ...cuota, enviadosDia: 100, enviadosMes: 3000 },
        recordatorio: {
          inicioCita: INICIO,
          venceEn: d('2026-10-15T16:00:00Z'),
        },
      });

      // Act & Assert
      expect(politica.evaluar(ctx)).toEqual({
        tipo: 'fallar',
        motivo: MotivoRecordatorio.CUOTA_AGOTADA,
      });
    });
  });

  describe('crearPoliticasEnvio / evaluarPoliticasEnvio', () => {
    const politicas = crearPoliticasEnvio(PARAMETROS);

    it('debería tener las nueve, en el orden de ADR-13 §7', () => {
      expect(politicas.map((p) => p.nombre)).toEqual([
        'vigencia_cita',
        'vencimiento',
        'configuracion_activa',
        'horas_sin_envio',
        'correo_presente',
        'no_suprimido',
        'consentimiento',
        'limite_tenant',
        'cuota_proveedor',
      ]);
    });

    it('todo en regla → enviar', () => {
      expect(evaluarPoliticasEnvio(politicas, contexto())).toEqual({
        tipo: 'enviar',
        politica: null,
      });
    });

    it('gana la PRIMERA que no continúa (cita cancelada antes que sin correo)', () => {
      // Act
      const decision = evaluarPoliticasEnvio(
        politicas,
        contexto({
          cita: { inicio: INICIO, vigente: false },
          correoPaciente: null,
          enviadosHoyTenant: 99,
        }),
      );

      // Assert
      expect(decision).toEqual({
        tipo: 'cancelar',
        motivo: MotivoRecordatorio.CITA_TERMINAL,
        politica: 'vigencia_cita',
      });
    });

    it('sin correo y sobre el tope del tenant → sin_correo (5 antes que 8)', () => {
      expect(
        evaluarPoliticasEnvio(
          politicas,
          contexto({ correoPaciente: null, enviadosHoyTenant: 40 }),
        ),
      ).toMatchObject({
        tipo: 'omitir',
        motivo: MotivoRecordatorio.SIN_CORREO,
      });
    });

    it('con los parámetros por defecto el consentimiento no frena el envío', () => {
      expect(
        evaluarPoliticasEnvio(
          politicas,
          contexto({ consentimientoPaciente: false }),
        ),
      ).toMatchObject({ tipo: 'enviar' });
    });
  });
});
