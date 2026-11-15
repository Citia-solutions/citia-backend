import { randomUUID } from 'node:crypto';

import { DerivadorTokenEnlaceDePrueba } from '../../../../test/support/derivador-token-enlace-de-prueba';
import {
  ContadorTransacciones,
  InMemoryAceptacionTerminosRepository,
  InMemoryCambioCitaRepository,
  InMemoryCitaRepository,
  InMemoryEnlaceCitaRepository,
  InMemoryPacienteRepository,
  InMemorySolicitudCitaRepository,
  PublicadorEnMemoria,
} from '../../../../test/support/in-memory-repositories';
import { CitasService } from '../../cita/application/citas.service';
import { EnlaceCitaNoValidoError } from '../../cita/application/enlace-cita-no-valido.error';
import { EnlacesCitaService } from '../../cita/application/enlaces-cita.service';
import { ActorCambio, TipoCambio } from '../../cita/domain/cambio-cita.entity';
import { Cita, EstadoCita, OrigenCita } from '../../cita/domain/cita.entity';
import { PacientesService } from '../../paciente/application/pacientes.service';
import {
  AceptacionTerminos,
  CanalAceptacion,
} from '../../paciente/domain/aceptacion-terminos.entity';
import { VersionTerminosNoVigenteError } from '../../paciente/domain/exceptions/version-terminos-no-vigente.error';
import { RolUsuario } from '../../usuario/domain/usuario.entity';
import { SolicitudesOtraHoraService } from '../../solicitud/application/solicitudes-otra-hora.service';
import { ReagendamientoYaSolicitadoError } from '../../solicitud/domain/reagendamiento-ya-solicitado.error';
import {
  EstadoSolicitud,
  TipoSolicitud,
} from '../../solicitud/domain/solicitud-cita.entity';
import { NombresCita } from '../domain/lector-nombres-cita';
import { VistaCitaPacienteDto } from '../presentation/dto/vista-cita-paciente.dto';
import { AccionNoDisponibleError } from './accion-no-disponible.error';
import { PortalPacienteService } from './portal-paciente.service';

/**
 * Portal del paciente como TEST DE APLICACIÓN (contrato §3.4 y §5): los
 * casos de uso REALES de `cita` (`EnlacesCitaService`, `CitasService`) y de
 * `solicitud` (`SolicitudesOtraHoraService`) sobre los dobles en memoria de
 * sus puertos. Así "nada después de inicio", "abrir no ejecuta nada" y el
 * aislamiento se comprueban sobre la cita, la bitácora y el outbox, no solo
 * sobre la respuesta.
 *
 * Lo que los dobles no reproducen (FOR UPDATE entre conexiones, el 23505
 * real) se cubre en `test/portal-paciente.e2e-spec.ts` (Postgres).
 */

const TZ = 'America/Santiago';
const INICIO = new Date('2026-10-20T13:00:00.000Z');
const ANTES = new Date('2026-10-20T10:00:00.000Z');

describe('PortalPacienteService', () => {
  const tenantId = randomUUID();
  const otroTenant = randomUUID();
  const duenio = randomUUID();
  const pacienteId = randomUUID();
  const NOMBRES: NombresCita = {
    profesional: 'Dra. Ana Soto',
    organizacion: 'Clínica Sur',
  };

  let ahora: Date;
  let citas: InMemoryCitaRepository;
  let cambios: InMemoryCambioCitaRepository;
  let pacientes: InMemoryPacienteRepository;
  let aceptaciones: InMemoryAceptacionTerminosRepository;
  let pacientesService: PacientesService;
  let solicitudes: InMemorySolicitudCitaRepository;
  let enlaces: InMemoryEnlaceCitaRepository;
  let transacciones: ContadorTransacciones;
  let eventos: PublicadorEnMemoria;
  let derivador: DerivadorTokenEnlaceDePrueba;
  let enlacesService: EnlacesCitaService;
  let nombres: { leer: jest.Mock };
  let portal: PortalPacienteService;

  let cita: Cita;
  let token: string;

  const sembrarCita = (
    props: Partial<{
      estado: EstadoCita;
      inicio: Date;
      tenantId: string;
      pacienteId: string;
    }> = {},
  ): Cita => {
    const nueva = Cita.reconstituir({
      id: randomUUID(),
      inicio: props.inicio ?? INICIO,
      duracionMin: 45,
      tipoConsulta: 'Endodoncia (no debe salir)',
      estado: props.estado ?? EstadoCita.PENDIENTE,
      tenantId: props.tenantId ?? tenantId,
      pacienteId: props.pacienteId ?? pacienteId,
      usuarioId: duenio,
      origen: OrigenCita.MANUAL,
      creadoEn: new Date('2026-10-01T00:00:00Z'),
      actualizadoEn: new Date('2026-10-01T00:00:00Z'),
    });
    citas.sembrar(nueva);
    return nueva;
  };

  /** El token del enlace activo de la cita (como lo emite el recordatorio). */
  const tokenDe = (c: Cita): Promise<string> =>
    enlacesService.asegurarActivo(c.id, c.tenantId, { tx: 'emision' });

  const enlaceIdDe = (c: Cita): string =>
    [...enlaces.enlaces.values()].find(
      (e) => e.citaId === c.id && e.estaActivo(),
    )!.id;

  /** Foto de lo que una lectura o una acción rechazada NO debe cambiar. */
  const foto = () => ({
    cita: JSON.stringify(citas.citas.get(cita.id)),
    estado: citas.citas.get(cita.id)?.estado,
    cambios: cambios.cambios.length,
    eventos: eventos.eventos.length,
    solicitudes: solicitudes.solicitudes.size,
    aceptaciones: aceptaciones.aceptaciones.length,
    consentimiento: pacientes.pacientes.get(pacienteId)?.consentimiento,
  });

  beforeEach(async () => {
    ahora = ANTES;
    citas = new InMemoryCitaRepository(TZ);
    cambios = new InMemoryCambioCitaRepository();
    pacientes = new InMemoryPacienteRepository();
    aceptaciones = new InMemoryAceptacionTerminosRepository(pacientes);
    solicitudes = new InMemorySolicitudCitaRepository();
    enlaces = new InMemoryEnlaceCitaRepository();
    transacciones = new ContadorTransacciones();
    eventos = new PublicadorEnMemoria();
    derivador = new DerivadorTokenEnlaceDePrueba();

    const reloj = () => ahora;
    pacientesService = new PacientesService(
      pacientes,
      aceptaciones,
      transacciones,
      reloj,
    );
    enlacesService = new EnlacesCitaService(
      enlaces,
      citas,
      derivador,
      transacciones,
      reloj,
    );
    const citasService = new CitasService(
      citas,
      cambios,
      pacientes,
      pacientesService,
      transacciones,
      eventos,
      TZ,
      reloj,
    );
    const otraHora = new SolicitudesOtraHoraService(
      solicitudes,
      pacientes,
      eventos,
    );
    nombres = { leer: jest.fn().mockResolvedValue(NOMBRES) };
    portal = new PortalPacienteService(
      transacciones,
      enlacesService,
      citasService,
      otraHora,
      nombres,
      pacientesService,
      TZ,
      reloj,
    );

    pacientes.pacientes.set(pacienteId, {
      id: pacienteId,
      rut: '123456785',
      nombre: 'Paciente Secreta',
      telefono: '+56 9 8765 4321',
      correo: 'secreta@correo.cl',
      consentimiento: true,
      tenantId,
    });
    cita = sembrarCita();
    token = await tokenDe(cita);
    transacciones.abiertas = 0;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ---------------------------------------------------------------------------
  describe('ver (GET)', () => {
    it('debería devolver la vista mínima del contrato', async () => {
      // Act
      const vista = await portal.ver(token);

      // Assert
      expect(vista).toBeInstanceOf(VistaCitaPacienteDto);
      expect(vista).toEqual({
        inicio: '2026-10-20T13:00:00.000Z',
        zonaHoraria: TZ,
        duracionMin: 45,
        estado: EstadoCita.PENDIENTE,
        profesional: 'Dra. Ana Soto',
        organizacion: 'Clínica Sur',
        accionesPermitidas: ['confirmar', 'cancelar', 'pedirOtraHora'],
        solicitudOtraHora: null,
        // US-11: el paciente no tiene ninguna aceptación propia.
        terminosPendientes: true,
      });
    });

    it('no debería exponer datos del paciente, tipo de consulta, ids ni el token', async () => {
      // Act
      const json = JSON.stringify(await portal.ver(token));

      // Assert
      for (const prohibido of [
        'Paciente Secreta',
        '123456785',
        '8765',
        'secreta@correo.cl',
        'Endodoncia',
        cita.id,
        pacienteId,
        tenantId,
        duenio,
        enlaceIdDe(cita),
        token,
      ]) {
        expect(json).not.toContain(prohibido);
      }
    });

    it('debería leer los nombres del DUEÑO de la cita y su tenant, en el tx', async () => {
      // Act
      await portal.ver(token);

      // Assert
      expect(nombres.leer).toHaveBeenCalledWith(
        duenio,
        tenantId,
        transacciones.ultimoContexto,
      );
    });

    it('abrir la página no ejecuta nada: N lecturas dejan cita, bitácora, outbox y solicitudes intactas', async () => {
      // Arrange
      const antes = foto();

      // Act
      for (let i = 0; i < 5; i++) await portal.ver(token);

      // Assert
      expect(foto()).toEqual(antes);
      expect(transacciones.abiertas).toBe(5);
    });

    it('debería bloquear la cita ANTES de leer la petición de otra hora, y leerla SIN bloqueo', async () => {
      // Arrange
      const bloqueo = jest.spyOn(citas, 'buscarPorIdParaActualizar');
      const lectura = jest.spyOn(solicitudes, 'buscarReagendamientoAbierto');
      const conBloqueo = jest.spyOn(
        solicitudes,
        'buscarReagendamientoAbiertoParaActualizar',
      );

      // Act
      await portal.ver(token);

      // Assert
      expect(bloqueo).toHaveBeenCalledWith(
        cita.id,
        tenantId,
        transacciones.ultimoContexto,
      );
      expect(lectura).toHaveBeenCalledWith(
        cita.id,
        tenantId,
        transacciones.ultimoContexto,
      );
      expect(bloqueo.mock.invocationCallOrder[0]).toBeLessThan(
        lectura.mock.invocationCallOrder[0],
      );
      expect(conBloqueo).not.toHaveBeenCalled();
    });

    it('confirmada → cancelar y pedirOtraHora', async () => {
      // Arrange
      await portal.confirmar(token);

      // Act
      const vista = await portal.ver(token);

      // Assert
      expect(vista.estado).toBe(EstadoCita.CONFIRMADA);
      expect(vista.accionesPermitidas).toEqual(['cancelar', 'pedirOtraHora']);
    });

    describe('primera apertura (US-07.01, H5)', () => {
      const aperturaDe = (c: Cita): Date | null =>
        [...enlaces.enlaces.values()].find(
          (e) => e.citaId === c.id && e.estaActivo(),
        )!.primeraAperturaEn;

      it('el primer GET válido la anota con el reloj del portal, en el tx, y los siguientes no la cambian', async () => {
        // Arrange
        const espia = jest.spyOn(enlacesService, 'registrarPrimeraApertura');
        expect(aperturaDe(cita)).toBeNull();

        // Act
        await portal.ver(token);
        const primera = aperturaDe(cita);
        ahora = new Date(ANTES.getTime() + 60_000);
        await portal.ver(token);

        // Assert
        expect(primera).toEqual(ANTES);
        expect(aperturaDe(cita)).toEqual(ANTES);
        expect(espia).toHaveBeenCalledTimes(2);
        expect(espia.mock.calls[0][1]).toEqual(ANTES);
        expect(espia.mock.calls[1][2]).toBe(transacciones.ultimoContexto);
      });

      it('la anota DESPUÉS de bloquear la cita (orden de bloqueo: la cita primero)', async () => {
        // Arrange
        const bloqueo = jest.spyOn(citas, 'buscarPorIdParaActualizar');
        const apertura = jest.spyOn(enlaces, 'registrarPrimeraApertura');

        // Act
        await portal.ver(token);

        // Assert
        expect(bloqueo.mock.invocationCallOrder[0]).toBeLessThan(
          apertura.mock.invocationCallOrder[0],
        );
      });

      it('las acciones POST no la anotan', async () => {
        // Arrange
        const espia = jest.spyOn(enlacesService, 'registrarPrimeraApertura');

        // Act
        await portal.pedirOtraHora(token, { preferencia: 'martes' });
        await portal.cancelar(token, undefined);

        // Assert
        expect(espia).not.toHaveBeenCalled();
      });
    });
  });

  // ---------------------------------------------------------------------------
  describe('enlace no válido → EnlaceCitaNoValidoError (el MISMO 404), sin cambiar nada', () => {
    type Caso = [string, () => Promise<unknown> | void];

    const acciones: [string, (t: unknown) => Promise<unknown>][] = [
      ['ver', (t) => portal.ver(t)],
      ['confirmar', (t) => portal.confirmar(t)],
      ['cancelar', (t) => portal.cancelar(t, 'motivo')],
      ['pedirOtraHora', (t) => portal.pedirOtraHora(t, { preferencia: 'x' })],
      // US-11: sin `exigir`, pero el mismo 404 y nada escrito.
      ['aceptarTerminos', (t) => portal.aceptarTerminos(t, '1.0')],
    ];

    // Cada caso prepara el estado y devuelve (vía `tokenUsado`) el token.
    let tokenUsado: unknown;

    const casos: Caso[] = [
      [
        'cabecera ausente',
        () => {
          tokenUsado = undefined;
        },
      ],
      [
        'formato incorrecto',
        () => {
          tokenUsado = 'no-es-un-token';
        },
      ],
      [
        'inexistente (formato válido)',
        () => {
          tokenUsado = 'A'.repeat(43);
        },
      ],
      [
        'revocado (invalidado por el profesional)',
        async () => {
          tokenUsado = token;
          await enlacesService.invalidar(cita.id, {
            userId: duenio,
            email: 'x@demo.cl',
            tenantId,
            rol: RolUsuario.PROFESIONAL,
          });
        },
      ],
      [
        'cita terminal',
        () => {
          tokenUsado = token;
          const c = citas.citas.get(cita.id)!;
          c.cancelar();
        },
      ],
      [
        'ya pasado el inicio',
        () => {
          tokenUsado = token;
          ahora = INICIO;
        },
      ],
    ];

    describe.each(acciones)('%s', (_nombre, accion) => {
      it.each(casos)('%s', async (_caso, preparar) => {
        // Arrange
        await preparar();
        const antes = foto();

        // Act
        const promesa = accion(tokenUsado);

        // Assert
        await expect(promesa).rejects.toBeInstanceOf(EnlaceCitaNoValidoError);
        await expect(promesa).rejects.toThrow('Enlace no válido o vencido');
        expect(foto()).toEqual(antes);
        expect(nombres.leer).not.toHaveBeenCalled();
      });
    });

    it.each(casos)(
      'ver con un enlace %s no anota la primera apertura (US-07.01)',
      async (_caso, preparar) => {
        // Arrange
        await preparar();
        const espia = jest.spyOn(enlaces, 'registrarPrimeraApertura');

        // Act & Assert
        await expect(portal.ver(tokenUsado)).rejects.toBeInstanceOf(
          EnlaceCitaNoValidoError,
        );
        expect(espia).not.toHaveBeenCalled();
        expect(
          [...enlaces.enlaces.values()].every(
            (e) => e.primeraAperturaEn === null,
          ),
        ).toBe(true);
      },
    );

    it.each(casos)(
      'aceptarTerminos con un enlace %s no toca la bandera de una ficha sin autorización (US-11)',
      async (_caso, preparar) => {
        // Arrange — la foto de arriba parte con la bandera en true; aquí, en
        // false, para ver que tampoco se enciende.
        pacientes.pacientes.set(pacienteId, {
          ...pacientes.pacientes.get(pacienteId)!,
          consentimiento: false,
        });
        await preparar();
        const registrar = jest.spyOn(pacientesService, 'registrarAceptacion');

        // Act & Assert
        await expect(
          portal.aceptarTerminos(tokenUsado, '1.0'),
        ).rejects.toBeInstanceOf(EnlaceCitaNoValidoError);
        expect(registrar).not.toHaveBeenCalled();
        expect(aceptaciones.aceptaciones).toHaveLength(0);
        expect(pacientes.pacientes.get(pacienteId)?.consentimiento).toBe(false);
      },
    );

    it('no debería consultar la base con un token mal formado', async () => {
      // Arrange
      const lectura = jest.spyOn(enlaces, 'buscarPorTokenHash');

      // Act & Assert
      await expect(portal.ver('corto')).rejects.toBeInstanceOf(
        EnlaceCitaNoValidoError,
      );
      expect(lectura).not.toHaveBeenCalled();
    });

    it('nada después de inicio con una cita REAGENDADA: manda el inicio nuevo', async () => {
      // Arrange — movida de las 13:00 a las 11:00; ahora son las 12:00
      const c = citas.citas.get(cita.id)!;
      c.reagendar(new Date('2026-10-20T11:00:00.000Z'));
      ahora = new Date('2026-10-20T12:00:00.000Z');
      const antes = foto();

      // Act & Assert
      await expect(portal.confirmar(token)).rejects.toBeInstanceOf(
        EnlaceCitaNoValidoError,
      );
      await expect(
        portal.pedirOtraHora(token, { preferencia: 'tardes' }),
      ).rejects.toBeInstanceOf(EnlaceCitaNoValidoError);
      await expect(portal.cancelar(token, undefined)).rejects.toBeInstanceOf(
        EnlaceCitaNoValidoError,
      );
      expect(foto()).toEqual(antes);
    });

    it('el reloj cruza el inicio DURANTE la petición: la acción del paciente lo vuelve a comprobar (el mismo 404) y no escribe nada', async () => {
      // Arrange — el portal y `resolver` evalúan a las 10:00; cuando
      // `CitasService` va a escribir, ya es la hora de inicio.
      const citasAlInicio = new CitasService(
        citas,
        cambios,
        pacientes,
        pacientesService,
        transacciones,
        eventos,
        TZ,
        () => INICIO,
      );
      const portalAlLimite = new PortalPacienteService(
        transacciones,
        enlacesService,
        citasAlInicio,
        new SolicitudesOtraHoraService(solicitudes, pacientes, eventos),
        nombres,
        pacientesService,
        TZ,
        () => ahora,
      );
      const antes = foto();

      // Act & Assert
      await expect(portalAlLimite.confirmar(token)).rejects.toBeInstanceOf(
        EnlaceCitaNoValidoError,
      );
      await expect(
        portalAlLimite.cancelar(token, 'llego tarde'),
      ).rejects.toBeInstanceOf(EnlaceCitaNoValidoError);
      expect(foto()).toEqual(antes);
      expect(citas.citas.get(cita.id)?.estado).toBe(EstadoCita.PENDIENTE);
    });

    it('al revés: reagendada MÁS TARDE, el enlace vuelve a servir pasado el inicio viejo', async () => {
      // Arrange — movida de las 13:00 a las 18:00; ahora son las 14:00
      const c = citas.citas.get(cita.id)!;
      c.reagendar(new Date('2026-10-20T18:00:00.000Z'));
      ahora = new Date('2026-10-20T14:00:00.000Z');

      // Act
      const vista = await portal.ver(token);

      // Assert
      expect(vista.inicio).toBe('2026-10-20T18:00:00.000Z');
    });
  });

  // ---------------------------------------------------------------------------
  describe('confirmar', () => {
    it('debería confirmar como PACIENTE: bitácora con el enlace, hecho con actor paciente, en UNA transacción', async () => {
      // Act
      const vista = await portal.confirmar(token);

      // Assert — cita
      expect(citas.citas.get(cita.id)?.estado).toBe(EstadoCita.CONFIRMADA);
      // Bitácora
      expect(cambios.cambios).toHaveLength(1);
      expect(cambios.cambios[0]).toMatchObject({
        citaId: cita.id,
        tipo: TipoCambio.CONFIRMADA,
        actorTipo: ActorCambio.PACIENTE,
        actorId: enlaceIdDe(cita),
      });
      // Outbox
      expect(eventos.eventos.map((e) => e.nombre)).toEqual(['CitaConfirmada']);
      expect(eventos.eventos[0].payload).toMatchObject({
        citaId: cita.id,
        usuarioId: duenio,
        actor: { tipo: 'paciente', id: enlaceIdDe(cita) },
      });
      expect(JSON.stringify(eventos.eventos)).not.toContain(token);
      // Una transacción, la misma para todo
      expect(transacciones.abiertas).toBe(1);
      expect(eventos.contextos[0]).toBe(transacciones.ultimoContexto);
      // Vista
      expect(vista.estado).toBe(EstadoCita.CONFIRMADA);
      expect(vista.accionesPermitidas).toEqual(['cancelar', 'pedirOtraHora']);
      expect(vista.solicitudOtraHora).toBeNull();
    });

    it('confirmar una cita ya confirmada → AccionNoDisponibleError (409), sin cambiar nada', async () => {
      // Arrange
      await portal.confirmar(token);
      const antes = foto();

      // Act & Assert
      await expect(portal.confirmar(token)).rejects.toBeInstanceOf(
        AccionNoDisponibleError,
      );
      expect(foto()).toEqual(antes);
    });

    it('con una petición de otra hora abierta → AccionNoDisponibleError (R6)', async () => {
      // Arrange
      await portal.pedirOtraHora(token, { preferencia: 'tardes' });
      const antes = foto();

      // Act & Assert
      await expect(portal.confirmar(token)).rejects.toBeInstanceOf(
        AccionNoDisponibleError,
      );
      expect(foto()).toEqual(antes);
    });
  });

  // ---------------------------------------------------------------------------
  describe('cancelar', () => {
    it('debería cancelar como paciente con el motivo recortado y devolver la vista cancelada sin acciones', async () => {
      // Act
      const vista = await portal.cancelar(token, '  me surgió un viaje  ');

      // Assert
      expect(citas.citas.get(cita.id)?.estado).toBe(EstadoCita.CANCELADA);
      expect(cambios.cambios[0]).toMatchObject({
        tipo: TipoCambio.CANCELADA,
        actorTipo: ActorCambio.PACIENTE,
        actorId: enlaceIdDe(cita),
        motivo: 'me surgió un viaje',
      });
      expect(eventos.eventos.map((e) => e.nombre)).toEqual(['CitaCancelada']);
      expect(vista).toMatchObject({
        estado: EstadoCita.CANCELADA,
        accionesPermitidas: [],
        solicitudOtraHora: null,
      });
    });

    it.each([undefined, '', '   '])(
      'debería tratar el motivo %p como ausente',
      async (motivo) => {
        // Act
        await portal.cancelar(token, motivo);

        // Assert
        expect(cambios.cambios[0].motivo ?? undefined).toBeUndefined();
      },
    );

    it('después de cancelar, el enlace ya no sirve (GET → 404)', async () => {
      // Arrange
      await portal.cancelar(token, undefined);

      // Act & Assert
      await expect(portal.ver(token)).rejects.toBeInstanceOf(
        EnlaceCitaNoValidoError,
      );
    });

    it('con una petición abierta se puede cancelar; la petición NO se toca aquí (la descarta el suscriptor)', async () => {
      // Arrange
      await portal.pedirOtraHora(token, { preferencia: 'tardes' });
      const conBloqueo = jest.spyOn(
        solicitudes,
        'buscarReagendamientoAbiertoParaActualizar',
      );

      // Act
      const vista = await portal.cancelar(token, undefined);

      // Assert
      expect(vista.estado).toBe(EstadoCita.CANCELADA);
      expect(vista.solicitudOtraHora).toBeNull();
      expect(conBloqueo).not.toHaveBeenCalled();
      const [peticion] = [...solicitudes.solicitudes.values()];
      expect(peticion.estado).toBe(EstadoSolicitud.RECIBIDA);
    });
  });

  // ---------------------------------------------------------------------------
  describe('pedirOtraHora', () => {
    it('debería crear la petición SIN tocar la cita (R1) y devolver la vista con solo cancelar (R6)', async () => {
      // Act
      const vista = await portal.pedirOtraHora(token, {
        preferencia: 'martes en la tarde',
        motivo: 'trabajo',
      });

      // Assert — la cita sigue igual
      const actual = citas.citas.get(cita.id)!;
      expect(actual.estado).toBe(EstadoCita.PENDIENTE);
      expect(actual.inicio).toEqual(INICIO);
      expect(cambios.cambios).toHaveLength(0);
      // La petición
      const [peticion] = [...solicitudes.solicitudes.values()];
      expect(peticion).toMatchObject({
        tipo: TipoSolicitud.REAGENDAMIENTO,
        citaOrigenId: cita.id,
        enlaceId: enlaceIdDe(cita),
        usuarioId: duenio,
        tenantId,
        preferenciaHoraria: 'martes en la tarde',
        motivo: 'trabajo',
        nombrePaciente: 'Paciente Secreta',
      });
      expect(peticion.estado).toBe(EstadoSolicitud.RECIBIDA);
      // El hecho, en la misma transacción
      expect(eventos.eventos.map((e) => e.nombre)).toEqual([
        'ReagendamientoSolicitado',
      ]);
      expect(eventos.contextos[0]).toBe(transacciones.ultimoContexto);
      expect(transacciones.abiertas).toBe(1);
      // La vista
      expect(vista.estado).toBe(EstadoCita.PENDIENTE);
      expect(vista.accionesPermitidas).toEqual(['cancelar']);
      expect(vista.solicitudOtraHora).toEqual({
        preferencia: 'martes en la tarde',
        solicitadaEn: peticion.recibidaEn.toISOString(),
      });
    });

    it('un GET posterior muestra la petición abierta y solo cancelar', async () => {
      // Arrange
      await portal.pedirOtraHora(token, { preferencia: 'tardes' });

      // Act
      const vista = await portal.ver(token);

      // Assert
      expect(vista.accionesPermitidas).toEqual(['cancelar']);
      expect(vista.solicitudOtraHora?.preferencia).toBe('tardes');
    });

    it('una segunda petición con otra abierta → AccionNoDisponibleError, sin crear otra', async () => {
      // Arrange
      await portal.pedirOtraHora(token, { preferencia: 'tardes' });
      const antes = foto();

      // Act & Assert
      await expect(
        portal.pedirOtraHora(token, { preferencia: 'mañanas' }),
      ).rejects.toBeInstanceOf(AccionNoDisponibleError);
      expect(foto()).toEqual(antes);
    });

    it('debería propagar ReagendamientoYaSolicitadoError si otra petición gana la carrera (23505 → 409)', async () => {
      // Arrange
      jest
        .spyOn(solicitudes, 'guardar')
        .mockRejectedValue(new ReagendamientoYaSolicitadoError());

      // Act & Assert
      await expect(
        portal.pedirOtraHora(token, { preferencia: 'tardes' }),
      ).rejects.toBeInstanceOf(ReagendamientoYaSolicitadoError);
    });
  });

  // ---------------------------------------------------------------------------
  describe('términos del paciente (US-11)', () => {
    /** Una aceptación ya registrada del paciente de la cita, por `canal`. */
    const sembrarAceptacion = (canal: CanalAceptacion): void => {
      const referencia = {
        [CanalAceptacion.FORMULARIO_PUBLICO]: { solicitudId: randomUUID() },
        [CanalAceptacion.ENLACE_CITA]: { enlaceId: randomUUID() },
        [CanalAceptacion.PROFESIONAL]: { usuarioId: duenio },
      }[canal];
      aceptaciones.aceptaciones.push(
        AceptacionTerminos.reconstituir({
          id: randomUUID(),
          tenantId,
          pacienteId,
          version: '1.0',
          canal,
          aceptadaEn: new Date('2026-10-01T00:00:00Z'),
          usuarioId: null,
          solicitudId: null,
          enlaceId: null,
          ...referencia,
        }),
      );
    };

    describe('terminosPendientes en la vista', () => {
      const respuestas: [string, () => Promise<VistaCitaPacienteDto>][] = [
        ['ver', () => portal.ver(token)],
        ['confirmar', () => portal.confirmar(token)],
        ['cancelar', () => portal.cancelar(token, undefined)],
        [
          'pedirOtraHora',
          () => portal.pedirOtraHora(token, { preferencia: 'tardes' }),
        ],
      ];

      it.each(respuestas)(
        '%s: true sin una aceptación propia',
        async (_n, llamar) => {
          expect((await llamar()).terminosPendientes).toBe(true);
        },
      );

      it.each(respuestas)(
        '%s: false con una aceptación del formulario',
        async (_n, llamar) => {
          sembrarAceptacion(CanalAceptacion.FORMULARIO_PUBLICO);
          expect((await llamar()).terminosPendientes).toBe(false);
        },
      );

      it('la aceptación del profesional NO cuenta', async () => {
        sembrarAceptacion(CanalAceptacion.PROFESIONAL);
        expect((await portal.ver(token)).terminosPendientes).toBe(true);
      });

      it('el GET no registra ninguna aceptación', async () => {
        await portal.ver(token);
        expect(aceptaciones.aceptaciones).toHaveLength(0);
      });

      it('la lee DENTRO de la transacción de la petición, por paciente y tenant de la cita, con las versiones que cubren', async () => {
        // Arrange
        const lectura = jest.spyOn(aceptaciones, 'existeDelTitular');

        // Act
        await portal.ver(token);

        // Assert
        expect(lectura).toHaveBeenCalledWith(
          pacienteId,
          tenantId,
          ['1.0'],
          transacciones.ultimoContexto,
        );
        expect(transacciones.abiertas).toBe(1);
      });

      it('false si el titular aceptó desde el enlace de OTRA cita suya (la aceptación es del paciente, no de la cita)', async () => {
        // Arrange
        const otraCita = sembrarCita({
          inicio: new Date('2026-10-22T13:00:00.000Z'),
        });
        await portal.aceptarTerminos(await tokenDe(otraCita), '1.0');

        // Act
        const vista = await portal.ver(token);

        // Assert
        expect(vista.terminosPendientes).toBe(false);
        expect(aceptaciones.filas()).toHaveLength(1);
      });

      it('ni el GET ni los otros tres POST registran: la ficha sin autorización sigue en false y sin filas', async () => {
        // Arrange
        pacientes.pacientes.set(pacienteId, {
          ...pacientes.pacientes.get(pacienteId)!,
          consentimiento: false,
        });
        const registrar = jest.spyOn(pacientesService, 'registrarAceptacion');

        // Act — las cuatro rutas que no son aceptar, cada una con su vista
        const vistas = [
          await portal.ver(token),
          await portal.confirmar(token),
          await portal.pedirOtraHora(token, { preferencia: 'tardes' }),
          await portal.cancelar(token, undefined),
        ];

        // Assert
        expect(vistas.map((v) => v.terminosPendientes)).toEqual([
          true,
          true,
          true,
          true,
        ]);
        expect(registrar).not.toHaveBeenCalled();
        expect(aceptaciones.aceptaciones).toHaveLength(0);
        expect(pacientes.pacientes.get(pacienteId)?.consentimiento).toBe(false);
      });
    });

    describe('aceptarTerminos', () => {
      it('debería registrar enlace_cita con el enlace y el ahora del portal, en el tx, y marcar la bandera', async () => {
        // Arrange — una ficha sin autorización
        pacientes.pacientes.set(pacienteId, {
          ...pacientes.pacientes.get(pacienteId)!,
          consentimiento: false,
        });

        // Act
        const vista = await portal.aceptarTerminos(token, '1.0');

        // Assert
        expect(aceptaciones.filas()).toEqual([
          expect.objectContaining({
            tenantId,
            pacienteId,
            version: '1.0',
            canal: CanalAceptacion.ENLACE_CITA,
            aceptadaEn: ANTES,
            enlaceId: enlaceIdDe(cita),
            usuarioId: null,
            solicitudId: null,
          }),
        ]);
        expect(pacientes.pacientes.get(pacienteId)?.consentimiento).toBe(true);
        expect(vista.terminosPendientes).toBe(false);
        expect(transacciones.abiertas).toBe(1);
      });

      it('no debería cambiar la cita, la bitácora, el outbox, las solicitudes ni la primera apertura', async () => {
        // Arrange
        const antes = foto();
        const apertura = jest.spyOn(enlaces, 'registrarPrimeraApertura');

        // Act
        await portal.aceptarTerminos(token, '1.0');

        // Assert
        const despues = foto();
        expect(despues.cita).toBe(antes.cita);
        expect(despues.cambios).toBe(antes.cambios);
        expect(despues.eventos).toBe(antes.eventos);
        expect(despues.solicitudes).toBe(antes.solicitudes);
        expect(despues.aceptaciones).toBe(1);
        expect(apertura).not.toHaveBeenCalled();
      });

      it('es idempotente: la segunda vez no escribe', async () => {
        // Act
        await portal.aceptarTerminos(token, '1.0');
        const vista = await portal.aceptarTerminos(token, '1.0');

        // Assert
        expect(aceptaciones.aceptaciones).toHaveLength(1);
        expect(vista.terminosPendientes).toBe(false);
      });

      it('con una aceptación del formulario no escribe nada', async () => {
        // Arrange
        sembrarAceptacion(CanalAceptacion.FORMULARIO_PUBLICO);

        // Act
        await portal.aceptarTerminos(token, '1.0');

        // Assert
        expect(aceptaciones.aceptaciones).toHaveLength(1);
      });

      it('con solo la del profesional, sí registra la del titular', async () => {
        // Arrange
        sembrarAceptacion(CanalAceptacion.PROFESIONAL);

        // Act
        await portal.aceptarTerminos(token, '1.0');

        // Assert
        expect(aceptaciones.filas().map((a) => a.canal)).toEqual([
          CanalAceptacion.PROFESIONAL,
          CanalAceptacion.ENLACE_CITA,
        ]);
      });

      it('vale con una petición de otra hora abierta y con la cita confirmada (sin exigir)', async () => {
        // Arrange
        await portal.pedirOtraHora(token, { preferencia: 'tardes' });

        // Act
        const conPeticion = await portal.aceptarTerminos(token, '1.0');

        // Assert
        expect(conPeticion.terminosPendientes).toBe(false);
        expect(conPeticion.solicitudOtraHora).not.toBeNull();

        // Y con la cita confirmada (otro paciente, otra cita)
        const otroPaciente = randomUUID();
        pacientes.pacientes.set(otroPaciente, {
          ...pacientes.pacientes.get(pacienteId)!,
          id: otroPaciente,
        });
        const confirmada = sembrarCita({
          estado: EstadoCita.CONFIRMADA,
          pacienteId: otroPaciente,
        });
        const vista = await portal.aceptarTerminos(
          await tokenDe(confirmada),
          '1.0',
        );
        expect(vista.estado).toBe(EstadoCita.CONFIRMADA);
        expect(vista.terminosPendientes).toBe(false);
      });

      it('bloquea la cita ANTES de escribir la bandera del paciente (orden cita → paciente)', async () => {
        // Arrange
        pacientes.pacientes.set(pacienteId, {
          ...pacientes.pacientes.get(pacienteId)!,
          consentimiento: false,
        });
        const bloqueo = jest.spyOn(citas, 'buscarPorIdParaActualizar');
        const insercion = jest.spyOn(aceptaciones, 'insertarSiNoExiste');
        const bandera = jest.spyOn(pacientes, 'marcarConsentimiento');

        // Act
        await portal.aceptarTerminos(token, '1.0');

        // Assert — todo en el MISMO tx
        expect(bloqueo.mock.invocationCallOrder[0]).toBeLessThan(
          insercion.mock.invocationCallOrder[0],
        );
        expect(insercion.mock.invocationCallOrder[0]).toBeLessThan(
          bandera.mock.invocationCallOrder[0],
        );
        expect(insercion.mock.calls[0][1]).toBe(transacciones.ultimoContexto);
        expect(bandera).toHaveBeenCalledWith(
          pacienteId,
          tenantId,
          transacciones.ultimoContexto,
        );
      });

      it.each([
        CanalAceptacion.FORMULARIO_PUBLICO,
        CanalAceptacion.ENLACE_CITA,
      ])(
        'con una aceptación propia de %s no llama a registrar (ni toca la fila del paciente)',
        async (canal) => {
          // Arrange
          sembrarAceptacion(canal);
          const registrar = jest.spyOn(pacientesService, 'registrarAceptacion');
          const bandera = jest.spyOn(pacientes, 'marcarConsentimiento');

          // Act
          const vista = await portal.aceptarTerminos(token, '1.0');

          // Assert
          expect(registrar).not.toHaveBeenCalled();
          expect(bandera).not.toHaveBeenCalled();
          expect(vista.terminosPendientes).toBe(false);
        },
      );

      it('después de aceptar, el GET ya no la pide y no escribe otra fila', async () => {
        // Arrange
        await portal.aceptarTerminos(token, '1.0');

        // Act
        const vista = await portal.ver(token);

        // Assert
        expect(vista.terminosPendientes).toBe(false);
        expect(aceptaciones.aceptaciones).toHaveLength(1);
      });

      it('con una petición de otra hora abierta, la vista conserva la petición y solo cancelar', async () => {
        // Arrange
        await portal.pedirOtraHora(token, { preferencia: 'tardes' });

        // Act
        const vista = await portal.aceptarTerminos(token, '1.0');

        // Assert
        expect(vista.accionesPermitidas).toEqual(['cancelar']);
        expect(vista.solicitudOtraHora?.preferencia).toBe('tardes');
        expect(solicitudes.solicitudes.size).toBe(1);
      });

      it('con una versión que no recibe aceptaciones (sin pasar por el DTO) lanza y no escribe', async () => {
        // Act & Assert
        await expect(
          portal.aceptarTerminos(token, '9.9'),
        ).rejects.toBeInstanceOf(VersionTerminosNoVigenteError);
        expect(aceptaciones.aceptaciones).toHaveLength(0);
      });
    });
  });

  // ---------------------------------------------------------------------------
  describe('aislamiento', () => {
    it('el enlace de la cita A no lee ni mueve la cita B del mismo paciente', async () => {
      // Arrange
      const citaB = sembrarCita({ inicio: new Date('2026-10-21T13:00:00Z') });
      await tokenDe(citaB);

      // Act
      const vista = await portal.confirmar(token);

      // Assert
      expect(vista.inicio).toBe(INICIO.toISOString());
      expect(citas.citas.get(cita.id)?.estado).toBe(EstadoCita.CONFIRMADA);
      expect(citas.citas.get(citaB.id)?.estado).toBe(EstadoCita.PENDIENTE);
    });

    it('cada enlace resuelve SU cita aunque sea de otro tenant', async () => {
      // Arrange
      const deOtro = sembrarCita({ tenantId: otroTenant });
      const tokenOtro = await tokenDe(deOtro);

      // Act
      await portal.ver(tokenOtro);

      // Assert
      expect(nombres.leer).toHaveBeenCalledWith(
        duenio,
        otroTenant,
        transacciones.ultimoContexto,
      );
    });
  });

  it('nombres que no existen en el tenant → error interno (500), nunca una vista a medias', async () => {
    // Arrange
    nombres.leer.mockResolvedValue(null);

    // Act & Assert
    await expect(portal.ver(token)).rejects.toThrow(/^Integridad/);
  });
});
