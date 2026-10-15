import { Cita, EstadoCita } from './cita.entity';
import {
  EnlaceCita,
  MotivoRevocacionEnlace,
  ReconstituirEnlaceCitaProps,
} from './enlace-cita.entity';

describe('EnlaceCita (dominio)', () => {
  const HASH = 'a'.repeat(64);
  const CITA_ID = 'cita-1';
  const TENANT_ID = 'tenant-1';
  const INICIO = new Date('2026-10-20T13:00:00.000Z');
  const ANTES = new Date('2026-10-20T12:59:59.999Z');

  const persistido = (
    extra: Partial<ReconstituirEnlaceCitaProps> = {},
  ): EnlaceCita =>
    EnlaceCita.reconstituir({
      id: 'enlace-1',
      citaId: CITA_ID,
      tenantId: TENANT_ID,
      version: 1,
      tokenHash: HASH,
      emitidoEn: new Date('2026-10-14T12:00:00.000Z'),
      revocadoEn: null,
      motivoRevocacion: null,
      revocadoPor: null,
      ...extra,
    });

  const cita = (
    estado: EstadoCita = EstadoCita.PENDIENTE,
    extra: Partial<{ id: string; tenantId: string; inicio: Date }> = {},
  ): Cita =>
    Cita.reconstituir({
      id: extra.id ?? CITA_ID,
      inicio: extra.inicio ?? INICIO,
      duracionMin: 45,
      tipoConsulta: 'Control',
      estado,
      tenantId: extra.tenantId ?? TENANT_ID,
      pacienteId: 'paciente-1',
      usuarioId: 'usuario-1',
      creadoEn: new Date('2026-10-01T00:00:00.000Z'),
      actualizadoEn: new Date('2026-10-01T00:00:00.000Z'),
    });

  describe('siguienteVersion', () => {
    it('debería empezar en 1 cuando la cita nunca tuvo enlace', () => {
      expect(EnlaceCita.siguienteVersion(null)).toBe(1);
    });

    it('debería ser la mayor versión + 1 cuando ya hubo enlaces', () => {
      expect(EnlaceCita.siguienteVersion(1)).toBe(2);
      expect(EnlaceCita.siguienteVersion(7)).toBe(8);
    });

    it.each([0, -1, 1.5, Number.NaN])(
      'debería rechazar una versión máxima inválida (%p)',
      (max) => {
        expect(() => EnlaceCita.siguienteVersion(max)).toThrow(RangeError);
      },
    );
  });

  describe('emitir', () => {
    it('debería nacer activo, sin id ni fecha de emisión (las pone la base)', () => {
      // Act
      const enlace = EnlaceCita.emitir({
        citaId: CITA_ID,
        tenantId: TENANT_ID,
        version: 1,
        tokenHash: HASH,
      });

      // Assert
      expect(enlace.estaActivo()).toBe(true);
      expect(enlace.id).toBeUndefined();
      expect(enlace.emitidoEn).toBeUndefined();
      expect(enlace).toMatchObject({
        citaId: CITA_ID,
        tenantId: TENANT_ID,
        version: 1,
        tokenHash: HASH,
        revocadoEn: null,
        motivoRevocacion: null,
        revocadoPor: null,
      });
    });

    it.each([0, -3, 2.5])('debería rechazar la versión %p', (version) => {
      expect(() =>
        EnlaceCita.emitir({
          citaId: CITA_ID,
          tenantId: TENANT_ID,
          version,
          tokenHash: HASH,
        }),
      ).toThrow(RangeError);
    });

    it.each([
      [
        'el token en claro (43 caracteres base64url)',
        'Ab-_'.repeat(10) + 'xyz',
      ],
      ['un hash en mayúsculas', 'A'.repeat(64)],
      ['un hash corto', 'a'.repeat(63)],
      ['vacío', ''],
    ])('debería rechazar %s sin repetir el valor', (_caso, valor) => {
      // Act
      const emitir = () =>
        EnlaceCita.emitir({
          citaId: CITA_ID,
          tenantId: TENANT_ID,
          version: 1,
          tokenHash: valor,
        });

      // Assert
      expect(emitir).toThrow(/SHA-256 hex/);
      if (valor) expect(emitir).not.toThrow(valor);
    });
  });

  describe('reconstituir', () => {
    it('debería repoblar la revocación sin validar', () => {
      // Act
      const enlace = persistido({
        version: 3,
        revocadoEn: new Date('2026-10-15T10:00:00.000Z'),
        motivoRevocacion: MotivoRevocacionEnlace.INVALIDADO,
        revocadoPor: 'usuario-1',
      });

      // Assert
      expect(enlace.id).toBe('enlace-1');
      expect(enlace.version).toBe(3);
      expect(enlace.estaActivo()).toBe(false);
      expect(enlace.motivoRevocacion).toBe(MotivoRevocacionEnlace.INVALIDADO);
    });

    it('no debería permitir fijar la revocación desde fuera', () => {
      // `revocadoEn` es solo lectura: la única forma de moverlo es invalidar.
      expect(
        Object.getOwnPropertyDescriptor(persistido(), 'revocadoEn'),
      ).toBeUndefined();
    });
  });

  describe('invalidar', () => {
    it('debería revocar un enlace activo con motivo, autor y fecha', () => {
      // Arrange
      const enlace = persistido();
      const ahora = new Date('2026-10-15T10:00:00.000Z');

      // Act
      const revocado = enlace.invalidar('usuario-1', ahora);

      // Assert
      expect(revocado).toBe(true);
      expect(enlace.estaActivo()).toBe(false);
      expect(enlace.revocadoEn).toBe(ahora);
      expect(enlace.motivoRevocacion).toBe(MotivoRevocacionEnlace.INVALIDADO);
      expect(enlace.revocadoPor).toBe('usuario-1');
    });

    it('debería ser idempotente y conservar la primera revocación', () => {
      // Arrange
      const primera = new Date('2026-10-15T10:00:00.000Z');
      const enlace = persistido();
      enlace.invalidar('usuario-1', primera);

      // Act
      const otraVez = enlace.invalidar(
        'usuario-2',
        new Date('2026-10-16T10:00:00.000Z'),
      );

      // Assert
      expect(otraVez).toBe(false);
      expect(enlace.revocadoEn).toBe(primera);
      expect(enlace.revocadoPor).toBe('usuario-1');
    });
  });

  describe('permiteActuarSobre', () => {
    it.each([EstadoCita.PENDIENTE, EstadoCita.CONFIRMADA])(
      'debería permitir con enlace activo, cita %s y antes del inicio',
      (estado) => {
        expect(persistido().permiteActuarSobre(cita(estado), ANTES)).toBe(true);
      },
    );

    it.each([
      EstadoCita.CANCELADA,
      EstadoCita.ASISTIO,
      EstadoCita.NO_ASISTIO,
      EstadoCita.GHOSTING,
    ])('no debería permitir con la cita %s (terminal)', (estado) => {
      expect(persistido().permiteActuarSobre(cita(estado), ANTES)).toBe(false);
    });

    it('no debería permitir justo en el inicio ni después', () => {
      const enlace = persistido();
      expect(enlace.permiteActuarSobre(cita(), INICIO)).toBe(false);
      expect(
        enlace.permiteActuarSobre(cita(), new Date(INICIO.getTime() + 1)),
      ).toBe(false);
    });

    it('debería usar el inicio VIGENTE: una cita reagendada más tarde vuelve a admitir', () => {
      // Arrange — la hora original ya pasó, pero se movió a mañana.
      const reagendada = cita(EstadoCita.PENDIENTE);
      reagendada.reagendar(new Date(INICIO.getTime() + 86_400_000));

      // Act & Assert
      expect(
        persistido().permiteActuarSobre(
          reagendada,
          new Date(INICIO.getTime() + 60_000),
        ),
      ).toBe(true);
    });

    it('no debería permitir con el enlace revocado', () => {
      const enlace = persistido();
      enlace.invalidar('usuario-1', new Date('2026-10-15T10:00:00.000Z'));
      expect(enlace.permiteActuarSobre(cita(), ANTES)).toBe(false);
    });

    it('no debería permitir sobre otra cita ni sobre una cita de otro tenant', () => {
      const enlace = persistido();
      expect(
        enlace.permiteActuarSobre(
          cita(EstadoCita.PENDIENTE, { id: 'otra' }),
          ANTES,
        ),
      ).toBe(false);
      expect(
        enlace.permiteActuarSobre(
          cita(EstadoCita.PENDIENTE, { tenantId: 'tenant-2' }),
          ANTES,
        ),
      ).toBe(false);
    });
  });
});
