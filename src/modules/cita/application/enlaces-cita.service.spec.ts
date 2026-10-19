import { randomUUID } from 'node:crypto';

import { DerivadorTokenEnlaceDePrueba } from '../../../../test/support/derivador-token-enlace-de-prueba';
import {
  ContadorTransacciones,
  InMemoryCitaRepository,
  InMemoryEnlaceCitaRepository,
} from '../../../../test/support/in-memory-repositories';
import { AuthenticatedUser } from '../../auth/jwt-payload.interface';
import { RolUsuario } from '../../usuario/domain/usuario.entity';
import { Cita, EstadoCita, OrigenCita } from '../domain/cita.entity';
import {
  EnlaceCita,
  MotivoRevocacionEnlace,
} from '../domain/enlace-cita.entity';
import { CitaNoEncontradaError } from './cita-no-encontrada.error';
import {
  AvisoEnlaceReemitido,
  EnlacesCitaService,
} from './enlaces-cita.service';

/**
 * EnlacesCitaService (Fase 3; ADR-10 §1, contrato §3.1) con los dobles en
 * memoria de los puertos y un derivador de prueba con la misma fórmula HMAC
 * que el adaptador real (este, con su propio spec en infrastructure/). Lo que los dobles no
 * reproducen (ON CONFLICT real, FOR NO KEY UPDATE entre conexiones) está en
 * `integration/enlaces-cita-persistencia.integration.spec.ts`.
 */

const TZ = 'America/Santiago';
const CLAVE = 'clave-del-enlace-para-tests-de-32-caracteres';
const INICIO = new Date('2026-10-20T13:00:00Z');
const ANTES = new Date('2026-10-20T12:00:00Z');

describe('EnlacesCitaService', () => {
  const tenantId = randomUUID();
  const otroTenant = randomUUID();
  const usuario: AuthenticatedUser = {
    userId: randomUUID(),
    email: 'prof@demo.cl',
    tenantId,
    rol: RolUsuario.PROFESIONAL,
  };

  let reloj: Date;
  let enlaces: InMemoryEnlaceCitaRepository;
  let citas: InMemoryCitaRepository;
  let transacciones: ContadorTransacciones;
  let derivador: DerivadorTokenEnlaceDePrueba;
  let avisos: AvisoEnlaceReemitido[];
  let servicio: EnlacesCitaService;
  let cita: Cita;
  const tx = { soy: 'tx-de-quien-llama' };

  const crearServicio = (clave = CLAVE): EnlacesCitaService => {
    derivador = new DerivadorTokenEnlaceDePrueba(clave);
    return new EnlacesCitaService(
      enlaces,
      citas,
      derivador,
      transacciones,
      () => reloj,
      (aviso) => avisos.push(aviso),
    );
  };

  const sembrarCita = (
    props: Partial<{ estado: EstadoCita; tenantId: string; inicio: Date }> = {},
  ): Cita => {
    const nueva = Cita.reconstituir({
      id: randomUUID(),
      inicio: props.inicio ?? INICIO,
      duracionMin: 50,
      tipoConsulta: 'Control',
      estado: props.estado ?? EstadoCita.PENDIENTE,
      tenantId: props.tenantId ?? tenantId,
      pacienteId: randomUUID(),
      usuarioId: usuario.userId,
      origen: OrigenCita.MANUAL,
      creadoEn: new Date('2026-10-01T00:00:00Z'),
      actualizadoEn: new Date('2026-10-01T00:00:00Z'),
    });
    citas.sembrar(nueva);
    return nueva;
  };

  const enlacesDe = (citaId: string): EnlaceCita[] =>
    [...enlaces.enlaces.values()]
      .filter((e) => e.citaId === citaId)
      .sort((a, b) => a.version - b.version);

  beforeEach(() => {
    reloj = ANTES;
    enlaces = new InMemoryEnlaceCitaRepository();
    citas = new InMemoryCitaRepository(TZ);
    transacciones = new ContadorTransacciones();
    avisos = [];
    servicio = crearServicio();
    cita = sembrarCita();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ---------------------------------------------------------------------------
  describe('asegurarActivo', () => {
    it('debería emitir la versión 1 y devolver su token (43 caracteres base64url) si la cita no tenía enlace', async () => {
      // Act
      const token = await servicio.asegurarActivo(cita.id, tenantId, tx);

      // Assert
      expect(token).toBe(derivador.derivar(cita.id, 1));
      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      const [enlace] = enlacesDe(cita.id);
      expect(enlace).toMatchObject({
        citaId: cita.id,
        tenantId,
        version: 1,
        tokenHash: derivador.hashear(token),
      });
      expect(enlace.estaActivo()).toBe(true);
    });

    it('nunca guarda el token: en la fila solo está su hash', async () => {
      // Act
      const token = await servicio.asegurarActivo(cita.id, tenantId, tx);

      // Assert
      expect(JSON.stringify(enlacesDe(cita.id))).not.toContain(token);
    });

    it('debería ser idempotente: dos llamadas, un solo enlace y el mismo token', async () => {
      // Act
      const primero = await servicio.asegurarActivo(cita.id, tenantId, tx);
      const segundo = await servicio.asegurarActivo(cita.id, tenantId, tx);

      // Assert
      expect(segundo).toBe(primero);
      expect(enlacesDe(cita.id)).toHaveLength(1);
    });

    it('debería ser determinista entre instancias del servicio (misma clave, misma cita y versión)', async () => {
      // Act
      const deUno = await servicio.asegurarActivo(cita.id, tenantId, tx);
      const deOtro = await crearServicio().asegurarActivo(
        cita.id,
        tenantId,
        tx,
      );

      // Assert
      expect(deOtro).toBe(deUno);
    });

    it('debería trabajar SOLO en el tx que recibe (no abre transacciones)', async () => {
      // Arrange
      const espiaActivo = jest.spyOn(enlaces, 'buscarActivoPorCita');
      const espiaInsertar = jest.spyOn(enlaces, 'insertarSiNoExiste');

      // Act
      await servicio.asegurarActivo(cita.id, tenantId, tx);

      // Assert
      expect(transacciones.abiertas).toBe(0);
      for (const llamada of espiaActivo.mock.calls) expect(llamada[1]).toBe(tx);
      expect(espiaInsertar.mock.calls[0][1]).toBe(tx);
    });

    it('tras invalidar, emite la versión siguiente con otro token', async () => {
      // Arrange
      const v1 = await servicio.asegurarActivo(cita.id, tenantId, tx);
      await servicio.invalidar(cita.id, usuario);

      // Act
      const v2 = await servicio.asegurarActivo(cita.id, tenantId, tx);

      // Assert
      expect(v2).not.toBe(v1);
      expect(v2).toBe(derivador.derivar(cita.id, 2));
      expect(
        enlacesDe(cita.id).map((e) => [e.version, e.estaActivo()]),
      ).toEqual([
        [1, false],
        [2, true],
      ]);
    });

    it('si otro proceso ganó la carrera (ON CONFLICT → false), devuelve el token del enlace que quedó', async () => {
      // Arrange — el otro proceso ya insertó v1, pero nuestra primera lectura
      // no lo vio (aún no confirmaba).
      enlaces.enlaces.set(
        'del-otro',
        EnlaceCita.reconstituir({
          id: 'del-otro',
          citaId: cita.id,
          tenantId,
          version: 1,
          tokenHash: derivador.hashear(derivador.derivar(cita.id, 1)),
          emitidoEn: ANTES,
          revocadoEn: null,
          motivoRevocacion: null,
          revocadoPor: null,
          primeraAperturaEn: null,
        }),
      );
      jest.spyOn(enlaces, 'buscarActivoPorCita').mockResolvedValueOnce(null);
      const espiaInsertar = jest.spyOn(enlaces, 'insertarSiNoExiste');

      // Act
      const token = await servicio.asegurarActivo(cita.id, tenantId, tx);

      // Assert
      expect(await espiaInsertar.mock.results[0].value).toBe(false);
      expect(token).toBe(derivador.derivar(cita.id, 1));
      expect(enlacesDe(cita.id)).toHaveLength(1);
    });

    it('lanza (y el envío reintenta) si el activo que quedó no corresponde a la clave vigente: nunca devuelve un enlace que no resuelve', async () => {
      // Arrange — otro proceso, con OTRA clave, emitió v1 entre medio
      const otraClave = new DerivadorTokenEnlaceDePrueba(`${CLAVE}-vieja`);
      enlaces.enlaces.set(
        'de-otra-clave',
        EnlaceCita.reconstituir({
          id: 'de-otra-clave',
          citaId: cita.id,
          tenantId,
          version: 1,
          tokenHash: otraClave.hashear(otraClave.derivar(cita.id, 1)),
          emitidoEn: ANTES,
          revocadoEn: null,
          motivoRevocacion: null,
          revocadoPor: null,
          primeraAperturaEn: null,
        }),
      );
      jest.spyOn(enlaces, 'buscarActivoPorCita').mockResolvedValueOnce(null);

      // Act & Assert
      await expect(
        servicio.asegurarActivo(cita.id, tenantId, tx),
      ).rejects.toThrow(/no corresponde a la clave vigente/);
    });

    it('lanza si tras emitir no queda ningún enlace activo (se revocó entre medio): nunca devuelve un token sin fila', async () => {
      // Arrange — la relectura posterior al INSERT no encuentra activo
      jest
        .spyOn(enlaces, 'buscarActivoPorCita')
        .mockResolvedValueOnce(null) // primera lectura: no hay
        .mockResolvedValueOnce(null); // relectura tras insertar: tampoco

      // Act & Assert
      await expect(
        servicio.asegurarActivo(cita.id, tenantId, tx),
      ).rejects.toThrow(/no quedó un enlace activo tras emitirlo/);
    });

    it('autocorrección (DT-45) con la cita ausente de su tenant → error interno (reintento), sin revocar nada', async () => {
      // Arrange — enlace de otra clave para una cita que el repositorio ya no ve
      const conClaveVieja = crearServicio(`${CLAVE}-anterior`);
      await conClaveVieja.asegurarActivo(cita.id, tenantId, tx);
      servicio = crearServicio();
      jest
        .spyOn(citas, 'buscarPorIdParaActualizar')
        .mockResolvedValueOnce(null);

      // Act & Assert
      await expect(
        servicio.asegurarActivo(cita.id, tenantId, tx),
      ).rejects.toThrow(/la cita del enlace no existe en su tenant/);
      expect(enlacesDe(cita.id).map((e) => e.estaActivo())).toEqual([true]);
      expect(avisos).toEqual([]);
    });

    it('propaga el error del repositorio (el envío lo trata como error interno)', async () => {
      // Arrange
      jest
        .spyOn(enlaces, 'insertarSiNoExiste')
        .mockRejectedValueOnce(new Error('connection reset'));

      // Act & Assert
      await expect(
        servicio.asegurarActivo(cita.id, tenantId, tx),
      ).rejects.toThrow('connection reset');
    });

    describe('autocorrección por cambio de ENLACE_CITA_CLAVE (DT-45)', () => {
      it('revoca como sistema el activo de la clave anterior, emite la versión siguiente y el nuevo token resuelve', async () => {
        // Arrange — un correo ya salió con la clave anterior
        const conClaveVieja = crearServicio(`${CLAVE}-anterior`);
        const tokenViejo = await conClaveVieja.asegurarActivo(
          cita.id,
          tenantId,
          tx,
        );
        const conClaveNueva = crearServicio(CLAVE);
        const espiaBloqueo = jest.spyOn(citas, 'buscarPorIdParaActualizar');

        // Act — el siguiente recordatorio
        const tokenNuevo = await conClaveNueva.asegurarActivo(
          cita.id,
          tenantId,
          tx,
        );

        // Assert — versión siguiente, con la clave vigente
        expect(tokenNuevo).not.toBe(tokenViejo);
        expect(tokenNuevo).toBe(derivador.derivar(cita.id, 2));
        const [v1, v2] = enlacesDe(cita.id);
        expect(v1.estaActivo()).toBe(false);
        expect(v1.motivoRevocacion).toBe(MotivoRevocacionEnlace.INVALIDADO);
        expect(v1.revocadoPor).toBeNull();
        expect(v1.revocadoEn).toEqual(ANTES);
        expect(v2).toMatchObject({ version: 2 });
        expect(v2.estaActivo()).toBe(true);
        // Cita primero (orden de bloqueo), con su tenant y en el mismo tx
        expect(espiaBloqueo).toHaveBeenCalledWith(cita.id, tenantId, tx);
        // El nuevo token resuelve; el del correo anterior ya no
        expect(await conClaveNueva.resolver(tokenNuevo, tx)).not.toBeNull();
        expect(await conClaveNueva.resolver(tokenViejo, tx)).toBeNull();
      });

      it('deja un aviso con ids y versión, sin token ni hash', async () => {
        // Arrange
        const tokenViejo = await crearServicio(
          `${CLAVE}-anterior`,
        ).asegurarActivo(cita.id, tenantId, tx);
        const hashViejo = enlacesDe(cita.id)[0].tokenHash;

        // Act
        await crearServicio(CLAVE).asegurarActivo(cita.id, tenantId, tx);

        // Assert
        expect(avisos).toEqual([
          {
            evento: 'enlace_cita.reemitido_por_cambio_de_clave',
            citaId: cita.id,
            tenantId,
            versionRevocada: 1,
          },
        ]);
        const texto = JSON.stringify(avisos);
        expect(texto).not.toContain(tokenViejo);
        expect(texto).not.toContain(hashViejo);
      });

      it('con la clave de siempre no revoca ni avisa', async () => {
        // Act
        await servicio.asegurarActivo(cita.id, tenantId, tx);
        await servicio.asegurarActivo(cita.id, tenantId, tx);

        // Assert
        expect(avisos).toEqual([]);
        expect(enlacesDe(cita.id)).toHaveLength(1);
      });

      it('si al bloquear la cita otro proceso ya corrigió el enlace, usa el suyo sin revocar nada', async () => {
        // Arrange — v1 con clave vieja; mientras esperamos el candado de la
        // cita, otro proceso la revoca y emite v2 con la clave vigente.
        await crearServicio(`${CLAVE}-anterior`).asegurarActivo(
          cita.id,
          tenantId,
          tx,
        );
        const otro = crearServicio(CLAVE);
        const nuestro = crearServicio(CLAVE);
        jest
          .spyOn(citas, 'buscarPorIdParaActualizar')
          .mockImplementationOnce(async (id, tenant) => {
            await otro.asegurarActivo(cita.id, tenantId, { otro: true });
            // El doble con bloqueo solo delega en buscarPorId.
            return citas.buscarPorId(id, tenant);
          });
        avisos = [];

        // Act
        const token = await nuestro.asegurarActivo(cita.id, tenantId, tx);

        // Assert — un solo aviso (el del otro) y v2 sigue activo
        expect(token).toBe(derivador.derivar(cita.id, 2));
        expect(enlacesDe(cita.id).map((e) => e.version)).toEqual([1, 2]);
        expect(enlacesDe(cita.id)[1].estaActivo()).toBe(true);
        expect(avisos).toHaveLength(1);
      });
    });
  });

  // ---------------------------------------------------------------------------
  describe('resolver', () => {
    let token: string;

    beforeEach(async () => {
      token = await servicio.asegurarActivo(cita.id, tenantId, tx);
    });

    it('debería devolver el enlace y la cita para un token válido', async () => {
      // Act
      const resuelto = await servicio.resolver(token, tx);

      // Assert
      expect(resuelto).not.toBeNull();
      expect(resuelto?.cita.id).toBe(cita.id);
      expect(resuelto?.enlace.citaId).toBe(cita.id);
      expect(resuelto?.enlace.version).toBe(1);
      expect(resuelto?.enlace.id).toBeDefined();
    });

    it('debería bloquear la cita (FOR NO KEY UPDATE) con el id y el tenant DEL ENLACE, en el tx recibido', async () => {
      // Arrange
      const espia = jest.spyOn(citas, 'buscarPorIdParaActualizar');

      // Act
      await servicio.resolver(token, tx);

      // Assert
      expect(espia).toHaveBeenCalledWith(cita.id, tenantId, tx);
    });

    it('orden: lee el enlace, bloquea la cita y RELEE el enlace', async () => {
      // Arrange
      const porHash = jest.spyOn(enlaces, 'buscarPorTokenHash');
      const bloqueo = jest.spyOn(citas, 'buscarPorIdParaActualizar');

      // Act
      await servicio.resolver(token, tx);

      // Assert
      expect(porHash).toHaveBeenCalledTimes(2);
      const [primeraLectura, relectura] = porHash.mock.invocationCallOrder;
      const [ordenBloqueo] = bloqueo.mock.invocationCallOrder;
      expect(primeraLectura).toBeLessThan(ordenBloqueo);
      expect(ordenBloqueo).toBeLessThan(relectura);
      expect(porHash.mock.calls[0][0]).toBe(derivador.hashear(token));
    });

    it.each([
      ['vacío', ''],
      ['corto', 'abc'],
      ['con caracteres fuera de base64url', `${'a'.repeat(42)}+`],
      ['un hash hex', 'f'.repeat(64)],
      ['ausente', undefined],
      ['un arreglo (cabecera repetida)', ['a', 'b']],
    ])(
      'formato inválido (%s) → null SIN consultar la base',
      async (_caso, valor) => {
        // Arrange
        const porHash = jest.spyOn(enlaces, 'buscarPorTokenHash');
        const bloqueo = jest.spyOn(citas, 'buscarPorIdParaActualizar');
        const hasheosAntes = derivador.hasheos;

        // Act
        const resuelto = await servicio.resolver(valor, tx);

        // Assert
        expect(resuelto).toBeNull();
        expect(porHash).not.toHaveBeenCalled();
        expect(bloqueo).not.toHaveBeenCalled();
        expect(derivador.hasheos).toBe(hasheosAntes);
      },
    );

    it('token con formato válido pero inexistente → null, sin bloquear ninguna cita', async () => {
      // Arrange
      const bloqueo = jest.spyOn(citas, 'buscarPorIdParaActualizar');

      // Act
      const resuelto = await servicio.resolver(
        derivador.derivar(cita.id, 99),
        tx,
      );

      // Assert
      expect(resuelto).toBeNull();
      expect(bloqueo).not.toHaveBeenCalled();
    });

    it('enlace revocado (invalidado) → null', async () => {
      // Arrange
      await servicio.invalidar(cita.id, usuario);

      // Act & Assert
      expect(await servicio.resolver(token, tx)).toBeNull();
    });

    it.each([
      EstadoCita.CANCELADA,
      EstadoCita.ASISTIO,
      EstadoCita.NO_ASISTIO,
      EstadoCita.GHOSTING,
    ])('cita terminal (%s) → null', async (estado) => {
      // Arrange
      citas.sembrar(
        Cita.reconstituir({ ...cita, estado, inicio: cita.inicio }),
      );

      // Act & Assert
      expect(await servicio.resolver(token, tx)).toBeNull();
    });

    it('cita confirmada (vigente) → sigue resolviendo', async () => {
      // Arrange
      citas.sembrar(
        Cita.reconstituir({ ...cita, estado: EstadoCita.CONFIRMADA }),
      );

      // Act & Assert
      expect(await servicio.resolver(token, tx)).not.toBeNull();
    });

    it('nada después de inicio: con el reloj en el inicio → null', async () => {
      // Arrange
      reloj = INICIO;

      // Act & Assert
      expect(await servicio.resolver(token, tx)).toBeNull();
    });

    it('manda el inicio VIGENTE: si la cita se reagendó más tarde, el mismo enlace sirve', async () => {
      // Arrange — ya pasó el inicio original
      reloj = new Date(INICIO.getTime() + 60_000);
      citas.sembrar(
        Cita.reconstituir({
          ...cita,
          estado: EstadoCita.PENDIENTE,
          inicio: new Date(INICIO.getTime() + 86_400_000),
        }),
      );

      // Act & Assert
      expect(await servicio.resolver(token, tx)).not.toBeNull();
    });

    it('si la cita ya no existe en el tenant del enlace → null', async () => {
      // Arrange
      citas.citas.delete(cita.id);

      // Act & Assert
      expect(await servicio.resolver(token, tx)).toBeNull();
    });

    it('si el enlace se revocó mientras se esperaba el bloqueo de la cita, la relectura lo detecta → null', async () => {
      // Arrange — la invalidación concurrente confirma justo antes de
      // obtener nosotros el candado de la cita
      jest
        .spyOn(citas, 'buscarPorIdParaActualizar')
        .mockImplementationOnce(async (id, tenant) => {
          await servicio.invalidar(cita.id, usuario);
          // El doble con bloqueo solo delega en buscarPorId.
          return citas.buscarPorId(id, tenant);
        });

      // Act & Assert
      expect(await servicio.resolver(token, tx)).toBeNull();
    });

    it('aislamiento: el enlace de la cita A no resuelve la cita B', async () => {
      // Arrange
      const otraCita = sembrarCita();
      const tokenB = await servicio.asegurarActivo(otraCita.id, tenantId, tx);

      // Act
      const deA = await servicio.resolver(token, tx);
      const deB = await servicio.resolver(tokenB, tx);

      // Assert
      expect(deA?.cita.id).toBe(cita.id);
      expect(deB?.cita.id).toBe(otraCita.id);
      expect(tokenB).not.toBe(token);
    });
  });

  // ---------------------------------------------------------------------------
  describe('invalidar', () => {
    it('debería revocar el activo con el usuario del token, en SU transacción', async () => {
      // Arrange
      await servicio.asegurarActivo(cita.id, tenantId, tx);

      // Act
      await servicio.invalidar(cita.id, usuario);

      // Assert
      expect(transacciones.abiertas).toBe(1);
      const [enlace] = enlacesDe(cita.id);
      expect(enlace.estaActivo()).toBe(false);
      expect(enlace.revocadoPor).toBe(usuario.userId);
      expect(enlace.motivoRevocacion).toBe(MotivoRevocacionEnlace.INVALIDADO);
      expect(enlace.revocadoEn).toEqual(ANTES);
    });

    it('debería bloquear la cita (FOR NO KEY UPDATE) con el tenant del token ANTES de tocar el enlace', async () => {
      // Arrange
      await servicio.asegurarActivo(cita.id, tenantId, tx);
      const bloqueo = jest.spyOn(citas, 'buscarPorIdParaActualizar');
      const activo = jest.spyOn(enlaces, 'buscarActivoPorCita');
      const guardar = jest.spyOn(enlaces, 'guardar');

      // Act
      await servicio.invalidar(cita.id, usuario);

      // Assert
      expect(bloqueo).toHaveBeenCalledWith(
        cita.id,
        tenantId,
        transacciones.ultimoContexto,
      );
      expect(bloqueo.mock.invocationCallOrder[0]).toBeLessThan(
        activo.mock.invocationCallOrder[0],
      );
      expect(activo.mock.invocationCallOrder[0]).toBeLessThan(
        guardar.mock.invocationCallOrder[0],
      );
    });

    it('sin enlace activo no hace nada y no falla (idempotente → 204)', async () => {
      // Arrange
      const guardar = jest.spyOn(enlaces, 'guardar');

      // Act & Assert
      await expect(
        servicio.invalidar(cita.id, usuario),
      ).resolves.toBeUndefined();
      expect(guardar).not.toHaveBeenCalled();
    });

    it('dos veces seguidas: la segunda no cambia la primera revocación', async () => {
      // Arrange
      await servicio.asegurarActivo(cita.id, tenantId, tx);
      await servicio.invalidar(cita.id, usuario);
      reloj = new Date(ANTES.getTime() + 60_000);

      // Act
      await servicio.invalidar(cita.id, usuario);

      // Assert
      expect(enlacesDe(cita.id)).toHaveLength(1);
      expect(enlacesDe(cita.id)[0].revocadoEn).toEqual(ANTES);
    });

    it('cita de otro tenant → CitaNoEncontradaError (404) y su enlace sigue activo', async () => {
      // Arrange
      const ajena = sembrarCita({ tenantId: otroTenant });
      await servicio.asegurarActivo(ajena.id, otroTenant, tx);

      // Act & Assert
      await expect(
        servicio.invalidar(ajena.id, usuario),
      ).rejects.toBeInstanceOf(CitaNoEncontradaError);
      expect(enlacesDe(ajena.id)[0].estaActivo()).toBe(true);
    });

    it('cita inexistente → CitaNoEncontradaError', async () => {
      await expect(
        servicio.invalidar(randomUUID(), usuario),
      ).rejects.toBeInstanceOf(CitaNoEncontradaError);
    });
  });
});
