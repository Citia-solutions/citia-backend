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

  describe('matriz completa: espejo exacto de los dos CHECK de la migración 1750000016000', () => {
    /**
     * Los dos CHECK, escritos como en SQL:
     *  - CHK_cambios_cita_pedido_por:
     *      pedido_por IS NULL OR tipo IN ('cancelada', 'reagendada')
     *  - CHK_cambios_cita_pedido_por_paciente:
     *      actor_tipo <> 'paciente' OR pedido_por IS NULL OR pedido_por = 'paciente'
     * La base acepta la fila si y solo si el dominio no lanza.
     */
    const laBaseLaAcepta = (
      tipo: TipoCambio,
      actor: ActorCambio,
      pedidoPor: PedidoPor | null,
    ): boolean =>
      (pedidoPor === null ||
        tipo === TipoCambio.CANCELADA ||
        tipo === TipoCambio.REAGENDADA) &&
      (actor !== ActorCambio.PACIENTE ||
        pedidoPor === null ||
        pedidoPor === PedidoPor.PACIENTE);

    const casos = Object.values(TipoCambio).flatMap((tipo) =>
      Object.values(ActorCambio).flatMap((actor) =>
        [null, PedidoPor.PACIENTE, PedidoPor.PROFESIONAL].map(
          (pedidoPor) => [tipo, actor, pedidoPor] as const,
        ),
      ),
    );

    it('cubre los 8 tipos × 3 actores × 3 valores (72 combinaciones)', () => {
      expect(casos).toHaveLength(72);
    });

    it.each(casos)(
      'tipo %s, actor %s, pedidoPor %s: el dominio rechaza exactamente lo que rechaza la base',
      (tipo, actor, pedidoPor) => {
        // Arrange
        const props = base({
          tipo,
          actorTipo: actor,
          actorId: actor === ActorCambio.SISTEMA ? null : 'id-del-actor',
          pedidoPor,
        });

        // Act
        const registrar = () => CambioCita.registrar(props);

        // Assert
        if (laBaseLaAcepta(tipo, actor, pedidoPor)) {
          expect(registrar().pedidoPor).toBe(pedidoPor);
        } else {
          expect(registrar).toThrow(RangeError);
        }
      },
    );
  });

  describe('detalles de la invariante', () => {
    it('debería aceptar pedidoPor del sistema en una cancelación (los CHECK no lo prohíben)', () => {
      // Hoy el sistema no cancela; si lo hiciera, la base lo aceptaría igual.
      const cambio = CambioCita.registrar(
        base({
          actorTipo: ActorCambio.SISTEMA,
          actorId: null,
          pedidoPor: PedidoPor.PROFESIONAL,
        }),
      );

      expect(cambio.pedidoPor).toBe(PedidoPor.PROFESIONAL);
      expect(cambio.actorId).toBeNull();
    });

    it('debería aceptar que el profesional cancele por pedido del paciente (actor ≠ quien lo pidió)', () => {
      const cambio = CambioCita.registrar(
        base({ pedidoPor: PedidoPor.PACIENTE }),
      );

      expect(cambio.actorTipo).toBe(ActorCambio.PROFESIONAL);
      expect(cambio.pedidoPor).toBe(PedidoPor.PACIENTE);
    });

    it('debería nombrar el tipo recibido en el mensaje cuando el tipo no admite pedidoPor', () => {
      expect(() =>
        CambioCita.registrar(
          base({ tipo: TipoCambio.GHOSTING, pedidoPor: PedidoPor.PACIENTE }),
        ),
      ).toThrow('llegó tipo "ghosting"');
    });

    it('debería revisar el tipo antes que el actor (un paciente con pedidoPor en una confirmación falla por el tipo)', () => {
      expect(() =>
        CambioCita.registrar(
          base({
            tipo: TipoCambio.CONFIRMADA,
            actorTipo: ActorCambio.PACIENTE,
            actorId: 'enlace-1',
            pedidoPor: PedidoPor.PROFESIONAL,
          }),
        ),
      ).toThrow(/solo aplica a una cancelación o un reagendamiento/);
    });

    it('no debería mutar las props recibidas ni completar el vacío (undefined → null en el cambio, la entrada queda igual)', () => {
      // Arrange
      const props = base({ actorTipo: ActorCambio.PACIENTE, actorId: 'e-1' });
      const copia = { ...props };

      // Act
      const cambio = CambioCita.registrar(props);

      // Assert
      expect(cambio.pedidoPor).toBeNull();
      expect(props).toEqual(copia);
      expect(props).not.toHaveProperty('pedidoPor');
    });
  });
});
