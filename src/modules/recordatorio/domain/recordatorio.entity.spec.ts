import { TransicionRecordatorioInvalidaError } from './exceptions/transicion-recordatorio-invalida.error';
import {
  CanalRecordatorio,
  EstadoRecordatorio,
  MotivoCancelacion,
  MotivoFallo,
  MotivoOmision,
  MotivoRecordatorio,
  Recordatorio,
} from './recordatorio.entity';
import { DatosRecordatorio } from './recordatorio.repository';

const AHORA = new Date('2026-10-13T18:00:00Z');

function datos(cambios: Partial<DatosRecordatorio> = {}): DatosRecordatorio {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    tenantId: 'tenant-1',
    citaId: '22222222-2222-4222-8222-222222222222',
    canal: CanalRecordatorio.EMAIL,
    antelacionMin: 1440,
    inicioCita: new Date('2026-10-14T18:00:00Z'),
    programadoPara: new Date('2026-10-13T18:00:00Z'),
    venceEn: new Date('2026-10-14T16:00:00Z'),
    estado: EstadoRecordatorio.PROGRAMADO,
    motivo: null,
    intentos: 0,
    proximoIntentoEn: new Date('2026-10-13T18:00:00Z'),
    ultimoError: null,
    proveedor: null,
    proveedorMensajeId: null,
    enviadoEn: null,
    entregadoEn: null,
    quejaEn: null,
    creadoEn: new Date('2026-10-10T12:00:00Z'),
    actualizadoEn: new Date('2026-10-10T12:00:00Z'),
    ...cambios,
  };
}

const en = (
  estado: EstadoRecordatorio,
  motivo: MotivoRecordatorio | null = null,
) => Recordatorio.reconstituir(datos({ estado, motivo }));

describe('Recordatorio (ADR-13 §4)', () => {
  describe('reconstituir', () => {
    it('debería copiar los datos sin compartir el objeto', () => {
      // Arrange
      const original = datos();

      // Act
      const r = Recordatorio.reconstituir(original);
      original.estado = EstadoRecordatorio.CANCELADO;

      // Assert
      expect(r.estado).toBe(EstadoRecordatorio.PROGRAMADO);
      expect(r.aDatos()).toEqual(datos());
      expect(r.aDatos()).not.toBe(r.aDatos());
    });

    it('debería exponer la clave y la cola', () => {
      // Act
      const r = Recordatorio.reconstituir(datos());

      // Assert
      expect(r).toMatchObject({
        citaId: '22222222-2222-4222-8222-222222222222',
        canal: CanalRecordatorio.EMAIL,
        antelacionMin: 1440,
        programadoPara: new Date('2026-10-13T18:00:00Z'),
        proximoIntentoEn: new Date('2026-10-13T18:00:00Z'),
      });
      expect(r.esParaInicio(new Date('2026-10-14T18:00:00Z'))).toBe(true);
      expect(r.esParaInicio(new Date('2026-10-14T18:30:00Z'))).toBe(false);
    });
  });

  describe('estaProgramado / esFinal', () => {
    it.each([
      [EstadoRecordatorio.PROGRAMADO, true, false],
      [EstadoRecordatorio.ENVIADO, false, false],
      [EstadoRecordatorio.ENTREGADO, false, true],
      [EstadoRecordatorio.FALLIDO, false, true],
      [EstadoRecordatorio.CANCELADO, false, true],
      [EstadoRecordatorio.OMITIDO, false, true],
    ])('%s → programado=%p, final=%p', (estado, programado, final) => {
      // Act
      const r = en(estado);

      // Assert
      expect(r.estaProgramado()).toBe(programado);
      expect(r.esFinal()).toBe(final);
    });
  });

  describe('registrarEnvio', () => {
    it('programado → enviado, con proveedor, id, enviadoEn y un intento más', () => {
      // Arrange
      const r = Recordatorio.reconstituir(datos({ intentos: 1 }));

      // Act
      r.registrarEnvio(
        { proveedor: 'resend', proveedorMensajeId: 'msg-1' },
        AHORA,
      );

      // Assert
      expect(r.aDatos()).toMatchObject({
        estado: EstadoRecordatorio.ENVIADO,
        proveedor: 'resend',
        proveedorMensajeId: 'msg-1',
        enviadoEn: AHORA,
        intentos: 2,
        motivo: null,
      });
    });

    it.each([
      EstadoRecordatorio.ENVIADO,
      EstadoRecordatorio.ENTREGADO,
      EstadoRecordatorio.CANCELADO,
      EstadoRecordatorio.OMITIDO,
      EstadoRecordatorio.FALLIDO,
    ])('no se puede desde %s', (estado) => {
      // Act & Assert
      expect(() =>
        en(estado).registrarEnvio(
          { proveedor: 'resend', proveedorMensajeId: null },
          AHORA,
        ),
      ).toThrow(TransicionRecordatorioInvalidaError);
    });
  });

  describe('registrarEntrega', () => {
    it('enviado → entregado conservando enviadoEn', () => {
      // Arrange
      const enviadoEn = new Date('2026-10-13T17:59:00Z');
      const r = Recordatorio.reconstituir(
        datos({ estado: EstadoRecordatorio.ENVIADO, enviadoEn }),
      );

      // Act
      r.registrarEntrega(AHORA);

      // Assert
      expect(r.estado).toBe(EstadoRecordatorio.ENTREGADO);
      expect(r.entregadoEn).toEqual(AHORA);
      expect(r.enviadoEn).toEqual(enviadoEn);
    });

    it('programado → entregado (delivered antes de confirmar el envío, ADR-13 §9.4)', () => {
      // Arrange
      const r = en(EstadoRecordatorio.PROGRAMADO);

      // Act
      r.registrarEntrega(AHORA);

      // Assert
      expect(r.estado).toBe(EstadoRecordatorio.ENTREGADO);
      expect(r.enviadoEn).toEqual(AHORA);
    });

    it.each([
      EstadoRecordatorio.ENTREGADO,
      EstadoRecordatorio.CANCELADO,
      EstadoRecordatorio.OMITIDO,
      EstadoRecordatorio.FALLIDO,
    ])('no se puede desde %s (monótono)', (estado) => {
      // Act & Assert
      expect(() => en(estado).registrarEntrega(AHORA)).toThrow(
        TransicionRecordatorioInvalidaError,
      );
    });
  });

  describe('anular', () => {
    it.each<MotivoCancelacion>([
      MotivoRecordatorio.CITA_TERMINAL,
      MotivoRecordatorio.REPROGRAMADO,
      MotivoRecordatorio.DESACTIVADO,
    ])('programado → cancelado (%s)', (motivo) => {
      // Arrange
      const r = en(EstadoRecordatorio.PROGRAMADO);

      // Act
      r.anular(motivo);

      // Assert
      expect(r.estado).toBe(EstadoRecordatorio.CANCELADO);
      expect(r.motivo).toBe(motivo);
    });

    it('un recordatorio ya enviado no se anula', () => {
      // Act & Assert
      expect(() =>
        en(EstadoRecordatorio.ENVIADO).anular(MotivoRecordatorio.REPROGRAMADO),
      ).toThrow(/anular\(reprogramado\).*"enviado"/);
    });

    it('rechaza un motivo que no es de cancelación aunque se fuerce el tipo', () => {
      // Act & Assert
      expect(() =>
        en(EstadoRecordatorio.PROGRAMADO).anular(
          MotivoRecordatorio.SIN_CORREO as unknown as MotivoCancelacion,
        ),
      ).toThrow(TransicionRecordatorioInvalidaError);
    });
  });

  describe('omitir', () => {
    it('programado → omitido con su motivo', () => {
      // Arrange
      const r = en(EstadoRecordatorio.PROGRAMADO);

      // Act
      r.omitir(MotivoRecordatorio.SIN_CORREO);

      // Assert
      expect(r.estado).toBe(EstadoRecordatorio.OMITIDO);
      expect(r.motivo).toBe(MotivoRecordatorio.SIN_CORREO);
    });

    it('rechaza un motivo de fallo', () => {
      // Act & Assert
      expect(() =>
        en(EstadoRecordatorio.PROGRAMADO).omitir(
          MotivoRecordatorio.VENCIDO as unknown as MotivoOmision,
        ),
      ).toThrow(TransicionRecordatorioInvalidaError);
    });

    it('no se puede desde cancelado', () => {
      // Act & Assert
      expect(() =>
        en(
          EstadoRecordatorio.CANCELADO,
          MotivoRecordatorio.REPROGRAMADO,
        ).omitir(MotivoRecordatorio.SIN_CORREO),
      ).toThrow(TransicionRecordatorioInvalidaError);
    });
  });

  describe('fallar', () => {
    it.each<MotivoFallo>([
      MotivoRecordatorio.CORREO_INVALIDO,
      MotivoRecordatorio.RECHAZADO,
      MotivoRecordatorio.VENCIDO,
      MotivoRecordatorio.CUOTA_AGOTADA,
      MotivoRecordatorio.REBOTE,
    ])('programado → fallido (%s)', (motivo) => {
      // Arrange
      const r = en(EstadoRecordatorio.PROGRAMADO);

      // Act
      r.fallar(motivo);

      // Assert
      expect(r.estado).toBe(EstadoRecordatorio.FALLIDO);
      expect(r.motivo).toBe(motivo);
    });

    it('suma un intento y guarda el código solo si se pide', () => {
      // Arrange
      const r = Recordatorio.reconstituir(
        datos({ intentos: 2, ultimoError: 'resend:500' }),
      );

      // Act
      r.fallar(MotivoRecordatorio.CORREO_INVALIDO, {
        ultimoError: 'resend:validation_error',
        contarIntento: true,
      });

      // Assert
      expect(r.intentos).toBe(3);
      expect(r.ultimoError).toBe('resend:validation_error');
    });

    it('vencido sin llamada al proveedor conserva el último error y los intentos', () => {
      // Arrange
      const r = Recordatorio.reconstituir(
        datos({ intentos: 2, ultimoError: 'resend:500' }),
      );

      // Act
      r.fallar(MotivoRecordatorio.VENCIDO);

      // Assert
      expect(r.intentos).toBe(2);
      expect(r.ultimoError).toBe('resend:500');
    });

    it.each<MotivoFallo>([
      MotivoRecordatorio.REBOTE,
      MotivoRecordatorio.RECHAZADO,
    ])('enviado → fallido por webhook (%s)', (motivo) => {
      // Arrange
      const r = en(EstadoRecordatorio.ENVIADO);

      // Act
      r.fallar(motivo);

      // Assert
      expect(r.estado).toBe(EstadoRecordatorio.FALLIDO);
    });

    it.each<MotivoFallo>([
      MotivoRecordatorio.VENCIDO,
      MotivoRecordatorio.CUOTA_AGOTADA,
      MotivoRecordatorio.CORREO_INVALIDO,
    ])('un enviado no falla por %s (ya salió)', (motivo) => {
      // Act & Assert
      expect(() => en(EstadoRecordatorio.ENVIADO).fallar(motivo)).toThrow(
        TransicionRecordatorioInvalidaError,
      );
    });

    it('un entregado no vuelve a fallido', () => {
      // Act & Assert
      expect(() =>
        en(EstadoRecordatorio.ENTREGADO).fallar(MotivoRecordatorio.REBOTE),
      ).toThrow(TransicionRecordatorioInvalidaError);
    });
  });

  describe('registrarReintento / posponer', () => {
    it('reintento: sigue programado, suma intento y reprograma la cola', () => {
      // Arrange
      const r = en(EstadoRecordatorio.PROGRAMADO);
      const proximo = new Date('2026-10-13T18:05:00Z');

      // Act
      r.registrarReintento('resend:500', proximo);

      // Assert
      expect(r.aDatos()).toMatchObject({
        estado: EstadoRecordatorio.PROGRAMADO,
        intentos: 1,
        ultimoError: 'resend:500',
        proximoIntentoEn: proximo,
        programadoPara: new Date('2026-10-13T18:00:00Z'),
      });
    });

    it('posponer: sigue programado SIN sumar intento', () => {
      // Arrange
      const r = en(EstadoRecordatorio.PROGRAMADO);
      const hasta = new Date('2026-10-14T11:00:00Z');

      // Act
      r.posponer(hasta);

      // Assert
      expect(r.intentos).toBe(0);
      expect(r.proximoIntentoEn).toEqual(hasta);
    });

    it('ninguno de los dos desde enviado', () => {
      // Arrange
      const r = en(EstadoRecordatorio.ENVIADO);

      // Act & Assert
      expect(() => r.posponer(AHORA)).toThrow(
        TransicionRecordatorioInvalidaError,
      );
      expect(() => r.registrarReintento('x', AHORA)).toThrow(
        TransicionRecordatorioInvalidaError,
      );
    });
  });

  describe('registrarQueja', () => {
    it('fija quejaEn una sola vez sin cambiar el estado', () => {
      // Arrange
      const r = en(EstadoRecordatorio.ENTREGADO);

      // Act
      const primera = r.registrarQueja(AHORA);
      const segunda = r.registrarQueja(new Date('2026-10-15T00:00:00Z'));

      // Assert
      expect(primera).toBe(true);
      expect(segunda).toBe(false);
      expect(r.quejaEn).toEqual(AHORA);
      expect(r.estado).toBe(EstadoRecordatorio.ENTREGADO);
    });

    it('no aplica a uno que nunca salió', () => {
      // Act & Assert
      expect(() =>
        en(EstadoRecordatorio.PROGRAMADO).registrarQueja(AHORA),
      ).toThrow(TransicionRecordatorioInvalidaError);
    });
  });

  it('el error de transición tiene un name estable', () => {
    // Act
    let capturado: unknown;
    try {
      en(
        EstadoRecordatorio.CANCELADO,
        MotivoRecordatorio.REPROGRAMADO,
      ).posponer(AHORA);
    } catch (e) {
      capturado = e;
    }

    // Assert
    expect(capturado).toBeInstanceOf(TransicionRecordatorioInvalidaError);
    expect((capturado as Error).name).toBe(
      'TransicionRecordatorioInvalidaError',
    );
  });
});
