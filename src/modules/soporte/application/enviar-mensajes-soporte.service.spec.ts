import {
  CanalMensajeriaFalso,
  aceptado,
  configuracion,
  cuotaAgotada,
  permanente,
  posibleDuplicado,
  transitorio,
} from '../../../../test/support/mensajeria-falsa';
import {
  MensajesSoporteEnMemoria,
  TransaccionesSoporteEnMemoria,
} from '../../../../test/support/soporte-en-memoria';
import { ResultadoEnvio } from '../../recordatorio/domain/canal-mensajeria';
import { Tenant, TipoTenant } from '../../tenant/domain/tenant.entity';
import { ITenantRepository } from '../../tenant/domain/tenant.repository';
import { RolUsuario, Usuario } from '../../usuario/domain/usuario.entity';
import { IUsuarioRepository } from '../../usuario/domain/usuario.repository';
import {
  CategoriaSoporte,
  DatosMensajeSoporte,
  EstadoEnvioSoporte,
} from '../domain/mensaje-soporte.entity';
import {
  CODIGO_SIN_DESTINO,
  EnviarMensajesSoporteService,
  ResultadoEnvioSoporte,
  claveIdempotenciaSoporte,
  nombreDeError,
} from './enviar-mensajes-soporte.service';
import { armarCorreoSoporte } from './plantilla-mensaje-soporte';

const TENANT = '7e000000-0000-4000-8000-000000000001';
const USUARIO = '0a5e0000-0000-4000-8000-000000000001';
const DESTINO = 'soporte@citiahealth.cl';
const TZ = 'America/Santiago';
const MIN = 60_000;
const HORA = 60 * MIN;
const CREADO = new Date('2026-10-31T14:00:00.000Z');
const AHORA = new Date('2026-10-31T15:00:00.000Z');

class ErrorDePrueba extends Error {
  constructor() {
    super('detalle que NO debe guardarse');
    this.name = 'ErrorDePrueba';
  }
}

const usuarioDePrueba = (): Usuario =>
  Object.assign(new Usuario(), {
    id: USUARIO,
    email: 'dra.soto@clinica.cl',
    passwordHash: 'hash',
    nombreCompleto: 'Dra. Ana Soto',
    especialidad: null,
    rol: RolUsuario.ADMINISTRADOR,
    tenantId: TENANT,
    sesionesValidasDesde: null,
    creadoEn: CREADO,
    actualizadoEn: CREADO,
  });

const tenantDePrueba = (): Tenant =>
  Object.assign(new Tenant(), {
    id: TENANT,
    nombre: 'Clínica Sur',
    slug: 'clinica-sur',
    tipo: TipoTenant.CLINICA,
    plan: 'free',
    creadoEn: CREADO,
  });

describe('EnviarMensajesSoporteService (job soporte.envio)', () => {
  let transacciones: TransaccionesSoporteEnMemoria;
  let mensajes: MensajesSoporteEnMemoria;
  let canal: CanalMensajeriaFalso;
  let findUsuario: jest.Mock<
    Promise<Usuario | null>,
    [string, string, unknown?]
  >;
  let findTenant: jest.Mock<Promise<Tenant | null>, [string, unknown?]>;
  let esperar: jest.Mock<Promise<void>, [number]>;
  let reloj: jest.Mock<Date, []>;

  const crear = (
    extra: Partial<{
      destino: string;
      tiempoMaximoEnvioMs: number;
    }> = {},
  ): EnviarMensajesSoporteService =>
    new EnviarMensajesSoporteService(
      transacciones,
      mensajes,
      { findById: findUsuario } as unknown as IUsuarioRepository,
      { findById: findTenant } as unknown as ITenantRepository,
      canal,
      {
        destino: extra.destino ?? DESTINO,
        tz: TZ,
        aleatorio: () => 0,
        tiempoMaximoEnvioMs: extra.tiempoMaximoEnvioMs,
      },
      reloj,
      esperar,
    );

  /** Un mensaje pendiente y vencido (próximo intento = creado). */
  const pendiente = (extra: Partial<DatosMensajeSoporte> = {}): string =>
    mensajes.sembrar({
      tenantId: TENANT,
      usuarioId: USUARIO,
      categoria: CategoriaSoporte.PROBLEMA,
      mensaje: 'No carga la agenda',
      estadoEnvio: EstadoEnvioSoporte.PENDIENTE,
      intentos: 0,
      proximoIntentoEn: CREADO,
      ultimoError: null,
      proveedor: null,
      proveedorMensajeId: null,
      enviadoEn: null,
      creadoEn: CREADO,
      ...extra,
    });

  /** Dos pendientes; el primero sale antes (próximo intento más antiguo). */
  const dosPendientes = (): [string, string] => [
    pendiente({ proximoIntentoEn: new Date(CREADO.getTime() - MIN) }),
    pendiente(),
  ];

  const ejecutar = (
    servicio = crear(),
    lote = 20,
    continuar?: () => boolean,
  ): Promise<ResultadoEnvioSoporte> => servicio.ejecutar({ lote, continuar });

  beforeEach(() => {
    transacciones = new TransaccionesSoporteEnMemoria();
    mensajes = new MensajesSoporteEnMemoria(transacciones);
    canal = new CanalMensajeriaFalso();
    findUsuario = jest
      .fn<Promise<Usuario | null>, [string, string, unknown?]>()
      .mockImplementation(() => Promise.resolve(usuarioDePrueba()));
    findTenant = jest
      .fn<Promise<Tenant | null>, [string, unknown?]>()
      .mockImplementation(() => Promise.resolve(tenantDePrueba()));
    esperar = jest.fn<Promise<void>, [number]>().mockResolvedValue(undefined);
    reloj = jest.fn<Date, []>().mockReturnValue(AHORA);
  });

  // ---------------------------------------------------------------------------
  describe('el mensaje saliente', () => {
    it('va al destino, con Reply-To = correo del profesional, Idempotency-Key soporte/<id> y la etiqueta', async () => {
      // Arrange
      const id = pendiente();

      // Act
      await ejecutar();

      // Assert
      expect(canal.enviados).toHaveLength(1);
      const [saliente] = canal.enviados;
      const correo = armarCorreoSoporte(
        {
          mensaje: mensajes.leer(id),
          usuario: {
            nombreCompleto: 'Dra. Ana Soto',
            email: 'dra.soto@clinica.cl',
            rol: RolUsuario.ADMINISTRADOR,
          },
          organizacion: { nombre: 'Clínica Sur', slug: 'clinica-sur' },
        },
        TZ,
      );
      expect(saliente).toEqual({
        destinatario: DESTINO,
        asunto: correo.asunto,
        html: correo.html,
        texto: correo.texto,
        responderA: 'dra.soto@clinica.cl',
        claveIdempotencia: `soporte/${id}`,
        etiquetas: { mensaje_soporte_id: id },
      });
      expect(claveIdempotenciaSoporte(id)).toBe(`soporte/${id}`);
    });

    it('lee el usuario y la organización con el tenant de la FILA, dentro de la transacción del reclamo', async () => {
      // Arrange
      pendiente();

      // Act
      await ejecutar();

      // Assert
      expect(findUsuario).toHaveBeenCalledWith(
        USUARIO,
        TENANT,
        expect.anything(),
      );
      expect(findTenant).toHaveBeenCalledWith(TENANT, expect.anything());
      const txUsuario = findUsuario.mock.calls[0][2];
      expect(txUsuario).toBe(findTenant.mock.calls[0][1]);
    });

    it('usuario inexistente → se envía igual, sin Reply-To', async () => {
      // Arrange
      const id = pendiente();
      findUsuario.mockResolvedValue(null);

      // Act
      const resultado = await ejecutar();

      // Assert
      expect(canal.enviados[0].responderA).toBeNull();
      expect(canal.enviados[0].texto).toContain('(el usuario ya no existe)');
      expect(resultado.enviados).toBe(1);
      expect(mensajes.leer(id).estadoEnvio).toBe(EstadoEnvioSoporte.ENVIADO);
    });

    it('reclama con la hora del reloj', async () => {
      // Arrange
      pendiente();

      // Act
      await ejecutar();

      // Assert
      expect(mensajes.reclamos[0]).toEqual(AHORA);
    });
  });

  // ---------------------------------------------------------------------------
  describe('los seis resultados del canal (ADR-15 §7)', () => {
    it('aceptado → enviado con enviado_en, proveedor e id; el lote sigue', async () => {
      // Arrange
      const [a, b] = dosPendientes();
      canal.responder(aceptado('msg_a'), aceptado('msg_b'));

      // Act
      const resultado = await ejecutar();

      // Assert
      const enviado = mensajes.leer(a);
      expect(enviado.estadoEnvio).toBe(EstadoEnvioSoporte.ENVIADO);
      expect(enviado.enviadoEn).toEqual(AHORA);
      expect(enviado.proveedor).toBe('falso');
      expect(enviado.proveedorMensajeId).toBe('msg_a');
      expect(enviado.intentos).toBe(1);
      expect(mensajes.leer(b).proveedorMensajeId).toBe('msg_b');
      expect(resultado).toEqual<ResultadoEnvioSoporte>({
        procesados: 2,
        enviados: 2,
        reintentos: 0,
        pospuestos: 0,
        fallidos: [],
        erroresInternos: [],
        configuracion: null,
        cuota: null,
        interrumpido: false,
      });
    });

    it('posible_duplicado → enviado sin id del proveedor', async () => {
      // Arrange
      const id = pendiente();
      canal.responder(posibleDuplicado());

      // Act
      const resultado = await ejecutar();

      // Assert
      const enviado = mensajes.leer(id);
      expect(enviado.estadoEnvio).toBe(EstadoEnvioSoporte.ENVIADO);
      expect(enviado.enviadoEn).toEqual(AHORA);
      expect(enviado.proveedorMensajeId).toBeNull();
      expect(resultado.enviados).toBe(1);
    });

    it('transitorio → intento + 1 y espera de 1 min (sigue pendiente); el lote sigue', async () => {
      // Arrange
      const [a, b] = dosPendientes();
      canal.responder(transitorio('application_error'), aceptado());

      // Act
      const resultado = await ejecutar();

      // Assert
      const reintento = mensajes.leer(a);
      expect(reintento.estaPendiente()).toBe(true);
      expect(reintento.intentos).toBe(1);
      expect(reintento.ultimoError).toBe('application_error');
      expect(reintento.proximoIntentoEn).toEqual(
        new Date(AHORA.getTime() + MIN),
      );
      expect(mensajes.leer(b).estadoEnvio).toBe(EstadoEnvioSoporte.ENVIADO);
      expect(resultado.reintentos).toBe(1);
      expect(resultado.enviados).toBe(1);
      expect(resultado.fallidos).toEqual([]);
    });

    it('transitorio al OCTAVO fallo → fallido, en la lista para la alerta', async () => {
      // Arrange
      const id = pendiente({ intentos: 7, ultimoError: 'rate_limit' });
      canal.responder(transitorio('application_error'));

      // Act
      const resultado = await ejecutar();

      // Assert
      const fallido = mensajes.leer(id);
      expect(fallido.estadoEnvio).toBe(EstadoEnvioSoporte.FALLIDO);
      expect(fallido.intentos).toBe(8);
      expect(resultado.fallidos).toEqual([
        { mensajeId: id, tenantId: TENANT, codigo: 'application_error' },
      ]);
      expect(resultado.reintentos).toBe(0);
    });

    it('cuota_agotada → otra vez en 1 hora SIN sumar intento, y corta el lote', async () => {
      // Arrange
      const [a, b] = dosPendientes();
      canal.responder(cuotaAgotada('dia'));

      // Act
      const resultado = await ejecutar();

      // Assert
      const pospuesto = mensajes.leer(a);
      expect(pospuesto.estaPendiente()).toBe(true);
      expect(pospuesto.intentos).toBe(0);
      expect(pospuesto.proximoIntentoEn).toEqual(
        new Date(AHORA.getTime() + HORA),
      );
      expect(mensajes.leer(b).proximoIntentoEn).toEqual(CREADO);
      expect(canal.enviados).toHaveLength(1);
      expect(resultado.pospuestos).toBe(1);
      expect(resultado.cuota).toBe('daily_quota_exceeded');
      expect(resultado.procesados).toBe(1);
    });

    it('permanente → fallido sin reintento; el lote sigue', async () => {
      // Arrange
      const [a, b] = dosPendientes();
      canal.responder(permanente(), aceptado());

      // Act
      const resultado = await ejecutar();

      // Assert
      const fallido = mensajes.leer(a);
      expect(fallido.estadoEnvio).toBe(EstadoEnvioSoporte.FALLIDO);
      expect(fallido.ultimoError).toBe('validation_error:to');
      expect(fallido.intentos).toBe(1);
      expect(mensajes.leer(b).estadoEnvio).toBe(EstadoEnvioSoporte.ENVIADO);
      expect(resultado.fallidos).toEqual([
        { mensajeId: a, tenantId: TENANT, codigo: 'validation_error:to' },
      ]);
    });

    it('configuracion → NO toca la fila (pendiente, mismo próximo intento, sin intento) y corta el lote', async () => {
      // Arrange
      const [a, b] = dosPendientes();
      const antes = mensajes.leer(a);
      canal.responder(configuracion('invalid_api_key'));

      // Act
      const resultado = await ejecutar();

      // Assert
      const intacto = mensajes.leer(a);
      expect(intacto.estaPendiente()).toBe(true);
      expect(intacto.intentos).toBe(0);
      expect(intacto.ultimoError).toBeNull();
      expect(intacto.proximoIntentoEn).toEqual(antes.proximoIntentoEn);
      expect(mensajes.leer(b).estaPendiente()).toBe(true);
      expect(canal.enviados).toHaveLength(1);
      expect(resultado.configuracion).toBe('invalid_api_key');
      expect(resultado.procesados).toBe(1);
      expect(resultado.enviados).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  describe('error propio (no del proveedor)', () => {
    it('se revierte y se registra como fallo en OTRA transacción; el lote sigue', async () => {
      // Arrange
      const [a, b] = dosPendientes();
      findUsuario.mockRejectedValueOnce(new ErrorDePrueba());

      // Act
      const resultado = await ejecutar();

      // Assert — el primero quedó con un intento y el nombre del error
      const conFallo = mensajes.leer(a);
      expect(conFallo.estaPendiente()).toBe(true);
      expect(conFallo.intentos).toBe(1);
      expect(conFallo.ultimoError).toBe('ErrorDePrueba');
      expect(conFallo.proximoIntentoEn).toEqual(
        new Date(AHORA.getTime() + MIN),
      );
      // …el segundo salió
      expect(mensajes.leer(b).estadoEnvio).toBe(EstadoEnvioSoporte.ENVIADO);
      expect(canal.enviados).toHaveLength(1);
      expect(resultado.erroresInternos).toEqual([
        { mensajeId: a, tenantId: TENANT, codigo: 'ErrorDePrueba' },
      ]);
      expect(resultado.reintentos).toBe(1);
      expect(resultado.enviados).toBe(1);
      // reclamo de a (revertido) + registro del fallo + b + reclamo vacío
      expect(transacciones.revertidas).toBe(1);
      expect(transacciones.confirmadas).toBe(3);
    });

    it('el canal que LANZA (contra su contrato) cuenta como error propio', async () => {
      // Arrange
      const id = pendiente();
      canal.responder(new ErrorDePrueba());

      // Act
      const resultado = await ejecutar();

      // Assert
      expect(mensajes.leer(id).ultimoError).toBe('ErrorDePrueba');
      expect(mensajes.leer(id).intentos).toBe(1);
      expect(resultado.erroresInternos).toHaveLength(1);
    });

    it('el canal que no responde a tiempo cuenta como error propio (TiempoAgotadoEnvioSoporteError)', async () => {
      // Arrange
      const id = pendiente();
      canal.responder(() => new Promise<ResultadoEnvio>(() => undefined));

      // Act
      await ejecutar(crear({ tiempoMaximoEnvioMs: 5 }));

      // Assert
      expect(mensajes.leer(id).ultimoError).toBe(
        'TiempoAgotadoEnvioSoporteError',
      );
    });

    it('si Resend aceptó y el commit falla, queda pendiente con un fallo y el reintento usa la MISMA clave', async () => {
      // Arrange
      const id = pendiente();
      transacciones.fallarProximoCommit = new ErrorDePrueba();

      // Act — primer tick: aceptado, pero el commit falla
      await ejecutar();
      expect(mensajes.leer(id).estaPendiente()).toBe(true);

      // Segundo tick, pasado el minuto de espera
      reloj.mockReturnValue(new Date(AHORA.getTime() + 2 * MIN));
      await ejecutar();

      // Assert
      expect(canal.enviados.map((m) => m.claveIdempotencia)).toEqual([
        `soporte/${id}`,
        `soporte/${id}`,
      ]);
      expect(canal.enviados[0]).toEqual(canal.enviados[1]);
      expect(mensajes.leer(id).estadoEnvio).toBe(EstadoEnvioSoporte.ENVIADO);
      expect(mensajes.leer(id).intentos).toBe(2);
    });

    it('al octavo fallo propio, fallido y en la lista para la alerta', async () => {
      // Arrange
      const id = pendiente({ intentos: 7 });
      findTenant.mockRejectedValueOnce(new ErrorDePrueba());

      // Act
      const resultado = await ejecutar();

      // Assert
      expect(mensajes.leer(id).estadoEnvio).toBe(EstadoEnvioSoporte.FALLIDO);
      expect(resultado.fallidos).toEqual([
        { mensajeId: id, tenantId: TENANT, codigo: 'ErrorDePrueba' },
      ]);
    });

    it('si registrar el fallo también falla, sube el error ORIGINAL (infraestructura)', async () => {
      // Arrange
      pendiente();
      const original = new ErrorDePrueba();
      findUsuario.mockRejectedValueOnce(original);
      jest
        .spyOn(mensajes, 'bloquearPorId')
        .mockRejectedValueOnce(new Error('connection refused'));

      // Act + Assert
      await expect(ejecutar()).rejects.toBe(original);
    });

    it('si falla el RECLAMO mismo, el error sube', async () => {
      // Arrange
      pendiente();
      const caida = new Error('connection refused');
      jest
        .spyOn(mensajes, 'reclamarSiguientePendiente')
        .mockRejectedValueOnce(caida);

      // Act + Assert
      await expect(ejecutar()).rejects.toBe(caida);
      expect(canal.enviados).toHaveLength(0);
    });

    it('nombreDeError: solo un nombre limpio, nunca el mensaje', () => {
      expect(nombreDeError(new ErrorDePrueba())).toBe('ErrorDePrueba');
      expect(nombreDeError(new TypeError('x'))).toBe('TypeError');
      expect(
        nombreDeError(Object.assign(new Error('x'), { name: 'con espacios' })),
      ).toBe('Error');
      expect(nombreDeError('texto')).toBe('Desconocido');
      expect(nombreDeError(null)).toBe('Desconocido');
    });
  });

  // ---------------------------------------------------------------------------
  describe('el lote', () => {
    it('continuar() en false antes de reclamar → interrumpido, sin tocar nada', async () => {
      // Arrange
      pendiente();

      // Act
      const resultado = await ejecutar(crear(), 20, () => false);

      // Assert
      expect(resultado.interrumpido).toBe(true);
      expect(resultado.procesados).toBe(0);
      expect(mensajes.reclamos).toEqual([]);
      expect(canal.enviados).toHaveLength(0);
    });

    it('continuar() se consulta antes de CADA mensaje (corta a mitad del lote)', async () => {
      // Arrange
      const [a, b] = dosPendientes();
      let vueltas = 0;

      // Act
      const resultado = await ejecutar(crear(), 20, () => vueltas++ < 1);

      // Assert
      expect(resultado.procesados).toBe(1);
      expect(resultado.interrumpido).toBe(true);
      expect(mensajes.leer(a).estadoEnvio).toBe(EstadoEnvioSoporte.ENVIADO);
      expect(mensajes.leer(b).estaPendiente()).toBe(true);
    });

    it('procesa como mucho `lote` mensajes', async () => {
      // Arrange
      for (let i = 0; i < 3; i++) pendiente();

      // Act
      const resultado = await ejecutar(crear(), 2);

      // Assert
      expect(resultado.procesados).toBe(2);
      expect(canal.enviados).toHaveLength(2);
    });

    it('sin pendientes vencidos no llama al canal', async () => {
      // Arrange — uno futuro y uno ya enviado
      pendiente({ proximoIntentoEn: new Date(AHORA.getTime() + MIN) });
      pendiente({
        estadoEnvio: EstadoEnvioSoporte.ENVIADO,
        enviadoEn: CREADO,
      });

      // Act
      const resultado = await ejecutar();

      // Assert
      expect(resultado.procesados).toBe(0);
      expect(canal.enviados).toHaveLength(0);
    });

    it('espera entre dos llamadas al proveedor, fuera de la transacción', async () => {
      // Arrange
      dosPendientes();

      // Act
      await ejecutar();

      // Assert — antes del 2.º envío y antes del reclamo que ya no encuentra nada
      expect(esperar).toHaveBeenCalledTimes(2);
      expect(esperar).toHaveBeenCalledWith(500);
    });

    it('sin destino no reclama nada (sin_destino)', async () => {
      // Arrange
      pendiente();

      // Act
      const resultado = await ejecutar(crear({ destino: '  ' }));

      // Assert
      expect(resultado.configuracion).toBe(CODIGO_SIN_DESTINO);
      expect(resultado.procesados).toBe(0);
      expect(mensajes.reclamos).toEqual([]);
      expect(canal.enviados).toHaveLength(0);
    });

    it.each([0, -1, 1.5, Number.NaN])(
      'rechaza un lote inválido (%p)',
      async (lote) => {
        await expect(ejecutar(crear(), lote)).rejects.toThrow(RangeError);
      },
    );
  });
});
