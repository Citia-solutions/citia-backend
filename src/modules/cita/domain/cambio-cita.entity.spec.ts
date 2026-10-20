import {
  ActorCambio,
  CambioCita,
  CrearCambioCitaProps,
  PedidoPor,
  TipoCambio,
} from './cambio-cita.entity';

describe('CambioCita.registrar: invariante de "quién lo pidió" (US-07.01)', () => {
  const base = (
    over: Partial<CrearCambioCitaProps> = {},
  ): CrearCambioCitaProps => ({
    citaId: 'cita-1',
    tenantId: 'tenant-1',
    tipo: TipoCambio.CANCELADA,
    actorTipo: ActorCambio.PROFESIONAL,
    actorId: 'usuario-1',
    ...over,
  });

  it.each([TipoCambio.CANCELADA, TipoCambio.REAGENDADA])(
    'acepta pedidoPor en un cambio %s',
    (tipo) => {
      for (const pedidoPor of [PedidoPor.PACIENTE, PedidoPor.PROFESIONAL]) {
        expect(CambioCita.registrar(base({ tipo, pedidoPor })).pedidoPor).toBe(
          pedidoPor,
        );
      }
    },
  );

  it.each(
    Object.values(TipoCambio).filter(
      (t) => t !== TipoCambio.CANCELADA && t !== TipoCambio.REAGENDADA,
    ),
  )('rechaza pedidoPor en un cambio %s (RangeError)', (tipo) => {
    expect(() =>
      CambioCita.registrar(base({ tipo, pedidoPor: PedidoPor.PACIENTE })),
    ).toThrow(RangeError);
  });

  it.each(Object.values(TipoCambio))(
    'sin pedidoPor, cualquier tipo (%s) queda con null',
    (tipo) => {
      expect(CambioCita.registrar(base({ tipo })).pedidoPor).toBeNull();
      expect(
        CambioCita.registrar(base({ tipo, pedidoPor: null })).pedidoPor,
      ).toBeNull();
    },
  );

  it('con actor paciente, "profesional" lanza RangeError', () => {
    expect(() =>
      CambioCita.registrar(
        base({
          actorTipo: ActorCambio.PACIENTE,
          actorId: 'enlace-1',
          pedidoPor: PedidoPor.PROFESIONAL,
        }),
      ),
    ).toThrow(RangeError);
  });

  it('con actor paciente, vacío queda vacío: la invariante solo rechaza, nunca completa', () => {
    // Las filas anteriores a US-07.01 vuelven así de la base (H12).
    const cambio = CambioCita.registrar(
      base({ actorTipo: ActorCambio.PACIENTE, actorId: 'enlace-1' }),
    );

    expect(cambio.pedidoPor).toBeNull();
  });

  it('con actor paciente, "paciente" se acepta', () => {
    expect(
      CambioCita.registrar(
        base({
          actorTipo: ActorCambio.PACIENTE,
          actorId: 'enlace-1',
          pedidoPor: PedidoPor.PACIENTE,
        }),
      ).pedidoPor,
    ).toBe(PedidoPor.PACIENTE);
  });

  it('rechaza un valor que no es de PedidoPor', () => {
    expect(() =>
      CambioCita.registrar(
        base({ pedidoPor: 'sistema' as unknown as PedidoPor }),
      ),
    ).toThrow(RangeError);
  });
});
