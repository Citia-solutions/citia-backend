import { randomUUID } from 'node:crypto';

import { DerivadorTokenEnlaceDePrueba } from '../../../../test/support/derivador-token-enlace-de-prueba';
import {
  ContadorTransacciones,
  InMemoryCitaRepository,
  InMemoryEnlaceCitaRepository,
} from '../../../../test/support/in-memory-repositories';
import {
  BitacoraEnMemoria,
  CanalMensajeriaFalso,
  aceptado,
  configuracion,
  cuotaAgotada,
  permanente,
  posibleDuplicado,
  transitorio,
} from '../../../../test/support/mensajeria-falsa';
import {
  ConfiguracionRecordatorioRepositoryEnMemoria,
  LectorCitasEnMemoria,
  RecordatorioRepositoryEnMemoria,
  SupresionCorreoRepositoryEnMemoria,
  citaLeida,
} from '../../../../test/support/recordatorios-en-memoria';
import { AuthenticatedUser } from '../../auth/jwt-payload.interface';
import { EnlacesCitaService } from '../../cita/application/enlaces-cita.service';
import { Cita, EstadoCita } from '../../cita/domain/cita.entity';
import { RolUsuario } from '../../usuario/domain/usuario.entity';
import { calcularHashCorreo } from '../domain/hash-correo';
import { CitaLeida } from '../domain/lector-citas';
import {
  CanalRecordatorio,
  EstadoRecordatorio,
  MotivoRecordatorio,
} from '../domain/recordatorio.entity';
import { DatosRecordatorio } from '../domain/recordatorio.repository';
import { MotivoSupresion } from '../domain/supresion-correo.repository';
import { AlertaRecordatorios } from './bitacora-recordatorios';
import {
  EnviarRecordatoriosService,
  OpcionesEnvio,
  TEXTO_ACCION_RECORDATORIO,
  urlEnlaceCita,
} from './enviar-recordatorios.service';

/**
 * Envío de recordatorios (ADR-13 §7–§9, §11) con los dobles en memoria de los
 * puertos y un `CanalMensajeria` falso que responde cada resultado de §8.
 */

const d = (iso: string): Date => new Date(iso);
const MIN = 60_000;
const HORA = 60 * MIN;

// Sábado 2026-10-10, 12:00 en Santiago (UTC−3): fuera de las horas sin envío.
const AHORA = d('2026-10-10T15:00:00Z');
// La cita, a las 14:00 de Santiago del mismo día.
const INICIO = d('2026-10-10T17:00:00Z');
// Fin del día UTC: reinicio de la cuota diaria del proveedor.
const MEDIANOCHE_UTC = d('2026-10-11T00:00:00Z');

const OPCIONES: OpcionesEnvio = {
  tz: 'America/Santiago',
  urlFrontend: 'http://localhost:5173',
  silencio: { desde: '21:00', hasta: '08:00' },
  exigirConsentimiento: false,
  maxDiarioPorTenant: 40,
  cuotaDiaria: 100,
  cuotaMensual: 3000,
  umbralAvisoCuota: 0.8,
  maxReintentos: 5,
  antelacionesPredeterminadasMin: [1440, 120],
};

const CORREO_PACIENTE = 'paciente.secreto@correo.cl';

describe('EnviarRecordatoriosService', () => {
  const tenantId = randomUUID();
  const otroTenant = randomUUID();
  const dueno = randomUUID();

  let reloj: Date;
  let transacciones: ContadorTransacciones;
  let recordatorios: RecordatorioRepositoryEnMemoria;
  let configuraciones: ConfiguracionRecordatorioRepositoryEnMemoria;
  let supresiones: SupresionCorreoRepositoryEnMemoria;
  let lector: LectorCitasEnMemoria;
  let canal: CanalMensajeriaFalso;
  let bitacora: BitacoraEnMemoria;
  let esperar: jest.Mock<Promise<void>, [number]>;
  let enlacesRepo: InMemoryEnlaceCitaRepository;
  let citasRepo: InMemoryCitaRepository;
  let derivador: DerivadorTokenEnlaceDePrueba;
  let enlaces: EnlacesCitaService;
  let servicio: EnviarRecordatoriosService;
  let cita: CitaLeida;

  function crear(
    opciones: Partial<OpcionesEnvio> = {},
  ): EnviarRecordatoriosService {
    return new EnviarRecordatoriosService(
      {
        transacciones,
        recordatorios,
        configuraciones,
        supresiones,
        lector,
        canal,
        bitacora,
        enlaces,
      },
      { ...OPCIONES, ...opciones },
      () => reloj,
      esperar,
    );
  }

  /** Un `programado` de `cita` que ya toca enviar. */
  function vencido(extra: Partial<DatosRecordatorio> = {}): DatosRecordatorio {
    return recordatorios.sembrar({
      tenantId,
      citaId: cita.id,
      antelacionMin: 120,
      inicioCita: cita.inicio,
      programadoPara: new Date(AHORA.getTime() - MIN),
      proximoIntentoEn: new Date(AHORA.getTime() - MIN),
      venceEn: new Date(cita.inicio.getTime() - 30 * MIN),
      ...extra,
    });
  }

  /** `n` recordatorios ya enviados en `enviadoEn`, de otra cita y otro tenant. */
  function yaEnviados(n: number, enviadoEn: Date, tenant = otroTenant): void {
    for (let i = 0; i < n; i++) {
      recordatorios.sembrar({
        tenantId: tenant,
        citaId: randomUUID(),
        antelacionMin: 120,
        inicioCita: INICIO,
        programadoPara: enviadoEn,
        estado: EstadoRecordatorio.ENVIADO,
        enviadoEn,
      });
    }
  }

  const fila = (id: string): DatosRecordatorio =>
    recordatorios.buscar(id) as DatosRecordatorio;

  beforeEach(() => {
    reloj = AHORA;
    transacciones = new ContadorTransacciones();
    recordatorios = new RecordatorioRepositoryEnMemoria(() => reloj);
    configuraciones = new ConfiguracionRecordatorioRepositoryEnMemoria();
    supresiones = new SupresionCorreoRepositoryEnMemoria();
    lector = new LectorCitasEnMemoria(recordatorios);
    canal = new CanalMensajeriaFalso();
    bitacora = new BitacoraEnMemoria();
    esperar = jest.fn<Promise<void>, [number]>().mockResolvedValue(undefined);
    // Enlace del paciente (Fase 3): el servicio real de `cita` sobre dobles.
    enlacesRepo = new InMemoryEnlaceCitaRepository();
    citasRepo = new InMemoryCitaRepository('America/Santiago');
    derivador = new DerivadorTokenEnlaceDePrueba();
    enlaces = new EnlacesCitaService(
      enlacesRepo,
      citasRepo,
      derivador,
      transacciones,
      () => reloj,
    );
    servicio = crear();
    cita = lector.sembrarCita(
      citaLeida({ tenantId, usuarioId: dueno, inicio: INICIO }),
      {
        paciente: { correo: CORREO_PACIENTE, consentimiento: true },
        profesional: { nombreCompleto: 'Dra. Ana Pérez' },
        organizacion: { nombre: 'Centro Norte' },
      },
    );
  });

  describe('aceptado', () => {
    it('deja el recordatorio enviado, con el id del proveedor y un intento', async () => {
      // Arrange
      const r = vencido();
      canal.responder(aceptado('re_123'));

      // Act
      const resultado = await servicio.enviarLote({ lote: 20 });

      // Assert
      expect(fila(r.id)).toMatchObject({
        estado: EstadoRecordatorio.ENVIADO,
        enviadoEn: AHORA,
        proveedor: 'falso',
        proveedorMensajeId: 're_123',
        intentos: 1,
      });
      expect(resultado).toMatchObject({
        procesados: 1,
        enviados: 1,
        corte: null,
      });
      expect(bitacora.de('recordatorio.enviado')).toHaveLength(1);
    });

    it('arma el mensaje: destinatario, clave de idempotencia, etiqueta y asunto neutro', async () => {
      // Arrange
      const r = vencido();

      // Act
      await servicio.enviarLote({ lote: 20 });

      // Assert
      expect(canal.enviados).toHaveLength(1);
      const [mensaje] = canal.enviados;
      expect(mensaje).toMatchObject({
        destinatario: CORREO_PACIENTE,
        claveIdempotencia: `recordatorio/${r.id}`,
        etiquetas: { recordatorio_id: r.id },
        responderA: null,
        asunto: 'Recordatorio de tu hora: sábado 10 de octubre, 14:00',
      });
      expect(mensaje.texto).toContain('Dra. Ana Pérez');
      expect(mensaje.texto).toContain('Centro Norte');
      expect(mensaje.texto).toContain('no recibe respuestas');
    });

    it('usa la configuración del DUEÑO de la cita: Reply-To y teléfono', async () => {
      // Arrange
      configuraciones.sembrar({
        tenantId,
        usuarioId: dueno,
        activo: true,
        canal: CanalRecordatorio.EMAIL,
        antelacionesMin: [120],
        telefonoContacto: '+56 2 2345 6789',
        correoRespuesta: 'consulta@ana.cl',
      });
      vencido();

      // Act
      await servicio.enviarLote({ lote: 20 });

      // Assert
      const [mensaje] = canal.enviados;
      expect(mensaje.responderA).toBe('consulta@ana.cl');
      expect(mensaje.html).toContain('+56 2 2345 6789');
      expect(mensaje.texto).toContain('Responde a este correo');
      expect(mensaje.texto).not.toContain('no recibe respuestas');
    });

    it('sin consentimiento se envía igual: la política está apagada (DT-16)', async () => {
      // Arrange
      lector.sembrarCita(cita, {
        paciente: { correo: CORREO_PACIENTE, consentimiento: false },
      });
      const r = vencido();

      // Act
      await servicio.enviarLote({ lote: 20 });

      // Assert
      expect(fila(r.id).estado).toBe(EstadoRecordatorio.ENVIADO);
    });

    it('nunca registra el correo del paciente en los logs', async () => {
      // Arrange
      vencido();
      canal.responder(transitorio());
      vencido({ antelacionMin: 1440 });

      // Act
      await servicio.enviarLote({ lote: 20 });

      // Assert
      expect(bitacora.entradas.length).toBeGreaterThan(0);
      expect(bitacora.comoTexto()).not.toContain(CORREO_PACIENTE);
      expect(bitacora.comoTexto()).not.toContain('Ana Pérez');
    });
  });

  describe('enlace del paciente (Fase 3, ADR-10 E3/E5)', () => {
    const enlacesDeLaCita = () =>
      [...enlacesRepo.enlaces.values()].filter((e) => e.citaId === cita.id);

    it('el correo lleva UN botón fijo "Ver o responder mi hora" → FRONTEND_URL/cita#<token>', async () => {
      // Arrange
      vencido();

      // Act
      await servicio.enviarLote({ lote: 20 });

      // Assert
      const token = derivador.derivar(cita.id, 1);
      const url = `http://localhost:5173/cita#${token}`;
      const [mensaje] = canal.enviados;
      expect(TEXTO_ACCION_RECORDATORIO).toBe('Ver o responder mi hora');
      expect(mensaje.html).toContain(
        `<a href="${url}" style="color:#1a56db;">Ver o responder mi hora</a>`,
      );
      expect(mensaje.texto).toContain(`Ver o responder mi hora: ${url}`);
      // Una sola acción en el cuerpo.
      expect(mensaje.html.match(/<a /g)).toHaveLength(1);
    });

    it('el enlace nace en la MISMA transacción del envío, con el tenant de la fila', async () => {
      // Arrange
      vencido();
      const espia = jest.spyOn(enlaces, 'asegurarActivo');
      const reclamo = jest.spyOn(recordatorios, 'reclamarProximoProgramado');

      // Act
      await servicio.enviarLote({ lote: 20 });

      // Assert — mismo contexto (por identidad) que el reclamo de la fila
      expect(espia).toHaveBeenCalledTimes(1);
      const [citaId, tenant, txEnlace] = espia.mock.calls[0];
      expect(citaId).toBe(cita.id);
      expect(tenant).toBe(tenantId);
      expect(txEnlace).toBe(reclamo.mock.calls[0][1]);
      expect(enlacesDeLaCita()).toHaveLength(1);
    });

    it('determinista: dos intentos del MISMO recordatorio mandan el mismo asunto, HTML y texto', async () => {
      // Arrange — el primer intento falla transitorio y se reintenta a 1 min
      const r = vencido();
      canal.responder(transitorio());
      await servicio.enviarLote({ lote: 20 });
      expect(fila(r.id).estado).toBe(EstadoRecordatorio.PROGRAMADO);

      // Act — segundo intento, ya aceptado
      reloj = new Date(AHORA.getTime() + 2 * MIN);
      await servicio.enviarLote({ lote: 20 });

      // Assert
      expect(fila(r.id).estado).toBe(EstadoRecordatorio.ENVIADO);
      expect(canal.enviados).toHaveLength(2);
      const [primero, segundo] = canal.enviados;
      expect(segundo.claveIdempotencia).toBe(primero.claveIdempotencia);
      expect(segundo.asunto).toBe(primero.asunto);
      expect(segundo.html).toBe(primero.html);
      expect(segundo.texto).toBe(primero.texto);
      expect(enlacesDeLaCita()).toHaveLength(1);
    });

    it('dos recordatorios de la misma cita llevan el mismo enlace (E1)', async () => {
      // Arrange
      vencido({ antelacionMin: 1440 });
      vencido({ antelacionMin: 120 });

      // Act
      await servicio.enviarLote({ lote: 20 });

      // Assert
      const url = urlEnlaceCita(
        OPCIONES.urlFrontend,
        derivador.derivar(cita.id, 1),
      );
      expect(canal.enviados).toHaveLength(2);
      for (const mensaje of canal.enviados) {
        expect(mensaje.texto).toContain(url);
      }
      expect(enlacesDeLaCita()).toHaveLength(1);
    });

    it('tras invalidar, el siguiente recordatorio lleva la versión siguiente', async () => {
      // Arrange — primer correo con v1; el profesional lo invalida
      vencido({ antelacionMin: 1440 });
      await servicio.enviarLote({ lote: 20 });
      const [v1] = enlacesDeLaCita();
      v1.invalidar(dueno, AHORA);
      await enlacesRepo.guardar(v1, { tx: 'invalidar' });
      vencido({ antelacionMin: 120 });

      // Act
      await servicio.enviarLote({ lote: 20 });

      // Assert
      const [, segundo] = canal.enviados;
      expect(segundo.texto).toContain(derivador.derivar(cita.id, 2));
      expect(segundo.texto).not.toContain(derivador.derivar(cita.id, 1));
    });

    it('si una política frena el envío, NO se emite enlace (solo nace al enviar)', async () => {
      // Arrange — paciente sin correo → omitido
      lector.sembrarCita(cita, {
        paciente: { correo: null, consentimiento: true },
      });
      vencido();
      const espia = jest.spyOn(enlaces, 'asegurarActivo');

      // Act
      await servicio.enviarLote({ lote: 20 });

      // Assert
      expect(espia).not.toHaveBeenCalled();
      expect(enlacesDeLaCita()).toHaveLength(0);
    });

    it('si asegurarActivo falla → error interno con reintento y SIN llamar al proveedor', async () => {
      // Arrange
      const r = vencido();
      jest
        .spyOn(enlaces, 'asegurarActivo')
        .mockRejectedValueOnce(
          Object.assign(new Error('x'), { name: 'QueryFailedError' }),
        );

      // Act
      const resultado = await servicio.enviarLote({ lote: 20 });

      // Assert
      expect(canal.enviados).toHaveLength(0);
      expect(resultado).toMatchObject({ erroresInternos: 1, enviados: 0 });
      expect(fila(r.id)).toMatchObject({
        estado: EstadoRecordatorio.PROGRAMADO,
        intentos: 1,
        ultimoError: 'interno:QueryFailedError',
        proximoIntentoEn: new Date(AHORA.getTime() + MIN),
      });
    });

    it('nunca registra el token ni la URL del enlace en los logs', async () => {
      // Arrange
      vencido();
      canal.responder(posibleDuplicado());

      // Act
      await servicio.enviarLote({ lote: 20 });

      // Assert
      const token = derivador.derivar(cita.id, 1);
      expect(bitacora.entradas.length).toBeGreaterThan(0);
      expect(bitacora.comoTexto()).not.toContain(token);
      expect(bitacora.comoTexto()).not.toContain('/cita#');
    });

    /**
     * La misma cita en el módulo `cita` (lo que bloquean `invalidar`,
     * `resolver` y la autocorrección por cambio de clave).
     */
    const sembrarCitaDeDominio = (estado = EstadoCita.PENDIENTE): Cita => {
      const deDominio = Cita.reconstituir({
        id: cita.id,
        inicio: cita.inicio,
        duracionMin: 45,
        tipoConsulta: 'Control',
        estado,
        tenantId,
        pacienteId: cita.pacienteId,
        usuarioId: dueno,
        creadoEn: d('2026-10-01T00:00:00Z'),
        actualizadoEn: d('2026-10-01T00:00:00Z'),
      });
      citasRepo.sembrar(deDominio);
      return deDominio;
    };

    const comoProfesional = (): AuthenticatedUser => ({
      userId: dueno,
      email: 'dra@centro-norte.cl',
      tenantId,
      rol: RolUsuario.PROFESIONAL,
    });

    it('el botón es el mismo sea cual sea el estado: una cita CONFIRMADA lleva el mismo texto y la misma URL', async () => {
      // Arrange — primero pendiente, después confirmada (por el paciente o el profesional)
      vencido({ antelacionMin: 1440 });
      await servicio.enviarLote({ lote: 20 });
      lector.actualizarCita(cita.id, { estado: 'confirmada' });
      vencido({ antelacionMin: 120 });

      // Act
      await servicio.enviarLote({ lote: 20 });

      // Assert
      const url = urlEnlaceCita(
        OPCIONES.urlFrontend,
        derivador.derivar(cita.id, 1),
      );
      expect(canal.enviados).toHaveLength(2);
      for (const mensaje of canal.enviados) {
        expect(mensaje.html).toContain(
          `<a href="${url}" style="color:#1a56db;">${TEXTO_ACCION_RECORDATORIO}</a>`,
        );
        expect(mensaje.texto).toContain(`${TEXTO_ACCION_RECORDATORIO}: ${url}`);
        // Ni "Confirmar" ni "Cancelar": abrir el correo no ejecuta nada
        expect(mensaje.html.match(/<a /g)).toHaveLength(1);
      }
    });

    it('tras invalidar desde el voucher (EnlacesCitaService.invalidar), el siguiente correo lleva otro token que SÍ resuelve; el del primero ya no', async () => {
      // Arrange — primer correo con la v1
      sembrarCitaDeDominio();
      vencido({ antelacionMin: 1440 });
      await servicio.enviarLote({ lote: 20 });
      const tokenV1 = derivador.derivar(cita.id, 1);
      await enlaces.invalidar(cita.id, comoProfesional());
      vencido({ antelacionMin: 120 });

      // Act
      await servicio.enviarLote({ lote: 20 });

      // Assert
      const tokenV2 = derivador.derivar(cita.id, 2);
      const [primero, segundo] = canal.enviados;
      expect(primero.texto).toContain(tokenV1);
      expect(segundo.texto).toContain(
        urlEnlaceCita(OPCIONES.urlFrontend, tokenV2),
      );
      expect(segundo.texto).not.toContain(tokenV1);
      // El del segundo correo abre la página; el del primero, el 404
      await expect(
        enlaces.resolver(tokenV2, { tx: 'portal' }),
      ).resolves.toMatchObject({ cita: { id: cita.id } });
      await expect(
        enlaces.resolver(tokenV1, { tx: 'portal' }),
      ).resolves.toBeNull();
    });

    it('autocuración (DT-45): si ENLACE_CITA_CLAVE cambió, el siguiente correo lleva la versión siguiente con la clave NUEVA y el enlace viejo queda revocado por el sistema', async () => {
      // Arrange — primer correo con la clave anterior
      sembrarCitaDeDominio();
      vencido({ antelacionMin: 1440 });
      await servicio.enviarLote({ lote: 20 });
      const tokenClaveVieja = derivador.derivar(cita.id, 1);
      // Se despliega con otra clave: otro derivador, mismo repositorio
      const derivadorNuevo = new DerivadorTokenEnlaceDePrueba(
        'otra-clave-del-enlace-de-32-caracteres!!',
      );
      enlaces = new EnlacesCitaService(
        enlacesRepo,
        citasRepo,
        derivadorNuevo,
        transacciones,
        () => reloj,
      );
      servicio = crear();
      vencido({ antelacionMin: 120 });

      // Act
      await servicio.enviarLote({ lote: 20 });

      // Assert — el segundo correo trae la v2 de la clave nueva, que resuelve
      const tokenNuevo = derivadorNuevo.derivar(cita.id, 2);
      const [, segundo] = canal.enviados;
      expect(segundo.texto).toContain(
        urlEnlaceCita(OPCIONES.urlFrontend, tokenNuevo),
      );
      expect(segundo.texto).not.toContain(tokenClaveVieja);
      await expect(
        enlaces.resolver(tokenNuevo, { tx: 'portal' }),
      ).resolves.not.toBeNull();
      await expect(
        enlaces.resolver(tokenClaveVieja, { tx: 'portal' }),
      ).resolves.toBeNull();
      const [v1, v2] = [...enlacesRepo.enlaces.values()]
        .filter((e) => e.citaId === cita.id)
        .sort((x, y) => x.version - y.version);
      expect(v1.estaActivo()).toBe(false);
      expect(v1.revocadoPor).toBeNull(); // revocación del sistema
      expect(v2.estaActivo()).toBe(true);
    });

    it('sin barra final duplicada aunque FRONTEND_URL la traiga', async () => {
      // Arrange
      servicio = crear({ urlFrontend: 'https://app.citia.cl/' });
      vencido();

      // Act
      await servicio.enviarLote({ lote: 20 });

      // Assert
      const [mensaje] = canal.enviados;
      expect(mensaje.texto).toContain(
        `https://app.citia.cl/cita#${derivador.derivar(cita.id, 1)}`,
      );
      expect(mensaje.texto).not.toContain('citia.cl//cita');
    });
  });

  describe('políticas (ADR-13 §7): se aplican SIN llamar al proveedor', () => {
    it('cita cancelada → cancelado (cita_terminal)', async () => {
      // Arrange
      lector.actualizarCita(cita.id, { estado: 'cancelada' });
      const r = vencido();

      // Act
      const resultado = await servicio.enviarLote({ lote: 20 });

      // Assert
      expect(fila(r.id)).toMatchObject({
        estado: EstadoRecordatorio.CANCELADO,
        motivo: MotivoRecordatorio.CITA_TERMINAL,
      });
      expect(canal.enviados).toHaveLength(0);
      expect(resultado.cancelados).toBe(1);
    });

    it('cita reagendada (otro inicio) → cancelado (reprogramado)', async () => {
      // Arrange
      const r = vencido();
      lector.actualizarCita(cita.id, {
        inicio: new Date(INICIO.getTime() + 24 * HORA),
      });

      // Act
      await servicio.enviarLote({ lote: 20 });

      // Assert
      expect(fila(r.id).motivo).toBe(MotivoRecordatorio.REPROGRAMADO);
      expect(canal.enviados).toHaveLength(0);
    });

    it('cita que ya no existe en el tenant → cancelado (cita_terminal)', async () => {
      // Arrange
      const r = recordatorios.sembrar({
        tenantId,
        citaId: randomUUID(),
        antelacionMin: 120,
        inicioCita: INICIO,
        programadoPara: AHORA,
        proximoIntentoEn: AHORA,
      });

      // Act
      await servicio.enviarLote({ lote: 20 });

      // Assert
      expect(fila(r.id)).toMatchObject({
        estado: EstadoRecordatorio.CANCELADO,
        motivo: MotivoRecordatorio.CITA_TERMINAL,
      });
    });

    it('vencido → fallido (vencido) sin sumar intento', async () => {
      // Arrange
      const r = vencido({ venceEn: AHORA });

      // Act
      await servicio.enviarLote({ lote: 20 });

      // Assert
      expect(fila(r.id)).toMatchObject({
        estado: EstadoRecordatorio.FALLIDO,
        motivo: MotivoRecordatorio.VENCIDO,
        intentos: 0,
      });
      expect(canal.enviados).toHaveLength(0);
    });

    it('configuración apagada → cancelado (desactivado)', async () => {
      // Arrange
      configuraciones.sembrar({
        tenantId,
        usuarioId: dueno,
        activo: false,
        canal: CanalRecordatorio.EMAIL,
        antelacionesMin: [120],
        telefonoContacto: null,
        correoRespuesta: null,
      });
      const r = vencido();

      // Act
      await servicio.enviarLote({ lote: 20 });

      // Assert
      expect(fila(r.id).motivo).toBe(MotivoRecordatorio.DESACTIVADO);
    });

    it('en horas sin envío → pospuesto a las 08:00 de la clínica', async () => {
      // Arrange — 22:30 en Santiago; la cita es pasado mañana
      reloj = d('2026-10-11T01:30:00Z');
      const r = vencido({
        proximoIntentoEn: d('2026-10-11T01:00:00Z'),
        venceEn: d('2026-10-12T15:00:00Z'),
      });

      // Act
      const resultado = await servicio.enviarLote({ lote: 20 });

      // Assert
      expect(fila(r.id)).toMatchObject({
        estado: EstadoRecordatorio.PROGRAMADO,
        proximoIntentoEn: d('2026-10-11T11:00:00Z'),
        intentos: 0,
      });
      expect(resultado.pospuestos).toBe(1);
      expect(canal.enviados).toHaveLength(0);
    });

    it('paciente sin correo → omitido (sin_correo)', async () => {
      // Arrange
      lector.sembrarCita(cita, {
        paciente: { correo: '   ', consentimiento: true },
      });
      const r = vencido();

      // Act
      await servicio.enviarLote({ lote: 20 });

      // Assert
      expect(fila(r.id)).toMatchObject({
        estado: EstadoRecordatorio.OMITIDO,
        motivo: MotivoRecordatorio.SIN_CORREO,
      });
    });

    it('dirección suprimida (por hash) → omitido (correo_suprimido)', async () => {
      // Arrange
      await supresiones.agregar(
        {
          correoHash: calcularHashCorreo(CORREO_PACIENTE.toUpperCase()),
          motivo: MotivoSupresion.REBOTE,
          origenRecordatorioId: null,
        },
        { tx: 'semilla' },
      );
      const r = vencido();

      // Act
      await servicio.enviarLote({ lote: 20 });

      // Assert
      expect(fila(r.id).motivo).toBe(MotivoRecordatorio.CORREO_SUPRIMIDO);
      expect(canal.enviados).toHaveLength(0);
    });

    it('tope diario del tenant (día de la clínica) → omitido (limite_tenant)', async () => {
      // Arrange — 3 enviados hoy por ESTE tenant, con tope 3
      servicio = crear({ maxDiarioPorTenant: 3 });
      yaEnviados(3, new Date(AHORA.getTime() - HORA), tenantId);
      const r = vencido();

      // Act
      await servicio.enviarLote({ lote: 20 });

      // Assert
      expect(fila(r.id).motivo).toBe(MotivoRecordatorio.LIMITE_TENANT);
    });

    it('los envíos de OTRO tenant no cuentan para el tope del tenant', async () => {
      // Arrange
      servicio = crear({ maxDiarioPorTenant: 3 });
      yaEnviados(3, new Date(AHORA.getTime() - HORA), otroTenant);
      const r = vencido();

      // Act
      await servicio.enviarLote({ lote: 20 });

      // Assert
      expect(fila(r.id).estado).toBe(EstadoRecordatorio.ENVIADO);
    });

    it('cuota local agotada y el reinicio llega a tiempo → pospuesto a medianoche UTC, sin llamar', async () => {
      // Arrange
      servicio = crear({ cuotaDiaria: 5 });
      yaEnviados(5, new Date(AHORA.getTime() - HORA));
      const r = vencido({ venceEn: d('2026-10-12T15:00:00Z') });

      // Act
      await servicio.enviarLote({ lote: 20 });

      // Assert
      expect(fila(r.id)).toMatchObject({
        estado: EstadoRecordatorio.PROGRAMADO,
        proximoIntentoEn: MEDIANOCHE_UTC,
      });
      expect(canal.enviados).toHaveLength(0);
      expect(bitacora.alertas(AlertaRecordatorios.CUOTA_AGOTADA)).toHaveLength(
        1,
      );
    });

    it('cuota local agotada y ya no alcanza → fallido (cuota_agotada), alerta una sola vez', async () => {
      // Arrange
      servicio = crear({ cuotaDiaria: 5 });
      yaEnviados(5, new Date(AHORA.getTime() - HORA));
      const a = vencido();
      const b = vencido({ antelacionMin: 1440 });

      // Act
      await servicio.enviarLote({ lote: 20 });

      // Assert
      for (const r of [a, b]) {
        expect(fila(r.id)).toMatchObject({
          estado: EstadoRecordatorio.FALLIDO,
          motivo: MotivoRecordatorio.CUOTA_AGOTADA,
          intentos: 0,
        });
      }
      expect(canal.enviados).toHaveLength(0);
      const alertas = bitacora.alertas(AlertaRecordatorios.CUOTA_AGOTADA);
      expect(alertas).toHaveLength(1);
      expect(alertas[0]).toMatchObject({
        nivel: 'error',
        campos: { alcance: 'dia', origen: 'local' },
      });
    });
  });

  describe('resultado del proveedor (ADR-13 §8)', () => {
    it('transitorio → reintento a 1 min, suma intento y guarda el código', async () => {
      // Arrange
      const r = vencido();
      canal.responder(transitorio('rate_limit_exceeded'));

      // Act
      const resultado = await servicio.enviarLote({ lote: 20 });

      // Assert
      expect(fila(r.id)).toMatchObject({
        estado: EstadoRecordatorio.PROGRAMADO,
        intentos: 1,
        ultimoError: 'rate_limit_exceeded',
        proximoIntentoEn: new Date(AHORA.getTime() + MIN),
      });
      expect(resultado.reintentos).toBe(1);
    });

    it('transitorio sigue el calendario: con 2 fallos previos espera 15 min', async () => {
      // Arrange
      const r = vencido({ intentos: 2 });
      canal.responder(transitorio());

      // Act
      await servicio.enviarLote({ lote: 20 });

      // Assert
      expect(fila(r.id).proximoIntentoEn).toEqual(
        new Date(AHORA.getTime() + 15 * MIN),
      );
    });

    it('transitorio acotado por venceEn: el último reintento queda 1 min antes', async () => {
      // Arrange — vence en 10 min; tocaría esperar 15
      const r = vencido({
        intentos: 2,
        venceEn: new Date(AHORA.getTime() + 10 * MIN),
      });
      canal.responder(transitorio());

      // Act
      await servicio.enviarLote({ lote: 20 });

      // Assert
      expect(fila(r.id).proximoIntentoEn).toEqual(
        new Date(AHORA.getTime() + 9 * MIN),
      );
    });

    it('transitorio con los reintentos agotados → fallido (vencido), suma el intento', async () => {
      // Arrange
      const r = vencido({ intentos: 5 });
      canal.responder(transitorio('application_error'));

      // Act
      await servicio.enviarLote({ lote: 20 });

      // Assert
      expect(fila(r.id)).toMatchObject({
        estado: EstadoRecordatorio.FALLIDO,
        motivo: MotivoRecordatorio.VENCIDO,
        intentos: 6,
        ultimoError: 'application_error',
      });
    });

    it('cuota agotada del proveedor → pospuesto al reinicio, corta el lote y deja de llamar', async () => {
      // Arrange
      const a = vencido({ venceEn: d('2026-10-12T15:00:00Z') });
      const b = vencido({
        antelacionMin: 1440,
        proximoIntentoEn: AHORA,
        venceEn: d('2026-10-12T15:00:00Z'),
      });
      canal.responder(cuotaAgotada('dia'));

      // Act
      const primero = await servicio.enviarLote({ lote: 20 });
      const segundo = await servicio.enviarLote({ lote: 20 });

      // Assert — el primero: pospuesto y corte; el segundo tick NO llama
      expect(primero).toMatchObject({
        procesados: 1,
        pospuestos: 1,
        corte: 'cuota_agotada',
      });
      expect(fila(a.id)).toMatchObject({
        estado: EstadoRecordatorio.PROGRAMADO,
        proximoIntentoEn: MEDIANOCHE_UTC,
        intentos: 0,
      });
      expect(segundo).toMatchObject({ procesados: 1, pospuestos: 1 });
      expect(fila(b.id).proximoIntentoEn).toEqual(MEDIANOCHE_UTC);
      expect(canal.enviados).toHaveLength(1);
      expect(bitacora.alertas(AlertaRecordatorios.CUOTA_AGOTADA)).toHaveLength(
        1,
      );
    });

    it('cuota agotada del proveedor y el reinicio no alcanza → fallido (cuota_agotada)', async () => {
      // Arrange
      const r = vencido();
      canal.responder(cuotaAgotada('dia'));

      // Act
      await servicio.enviarLote({ lote: 20 });

      // Assert
      expect(fila(r.id)).toMatchObject({
        estado: EstadoRecordatorio.FALLIDO,
        motivo: MotivoRecordatorio.CUOTA_AGOTADA,
        intentos: 1,
        ultimoError: 'daily_quota_exceeded',
      });
    });

    it('cuota MENSUAL agotada → pospone al primer día del mes siguiente (UTC)', async () => {
      // Arrange
      const r = vencido({ venceEn: d('2026-11-05T00:00:00Z') });
      canal.responder(cuotaAgotada('mes'));

      // Act
      await servicio.enviarLote({ lote: 20 });

      // Assert
      expect(fila(r.id).proximoIntentoEn).toEqual(d('2026-11-01T00:00:00Z'));
    });

    it('permanente → fallido con su motivo, sin reintento ni supresión', async () => {
      // Arrange
      const r = vencido();
      canal.responder(permanente(MotivoRecordatorio.CORREO_INVALIDO));

      // Act
      await servicio.enviarLote({ lote: 20 });

      // Assert
      expect(fila(r.id)).toMatchObject({
        estado: EstadoRecordatorio.FALLIDO,
        motivo: MotivoRecordatorio.CORREO_INVALIDO,
        intentos: 1,
        ultimoError: 'validation_error:to',
      });
      expect(supresiones.supresiones.size).toBe(0);
    });

    it('configuración → no toca el recordatorio, alerta y corta el lote', async () => {
      // Arrange
      const a = vencido();
      const b = vencido({ antelacionMin: 1440, proximoIntentoEn: AHORA });
      canal.responder(configuracion('invalid_api_key'));

      // Act
      const resultado = await servicio.enviarLote({ lote: 20 });

      // Assert
      expect(resultado).toMatchObject({
        procesados: 1,
        sinCambios: 1,
        corte: 'configuracion',
      });
      expect(fila(a.id)).toMatchObject({
        estado: EstadoRecordatorio.PROGRAMADO,
        intentos: 0,
        ultimoError: null,
      });
      expect(fila(b.id).estado).toBe(EstadoRecordatorio.PROGRAMADO);
      expect(canal.enviados).toHaveLength(1);
      const alertas = bitacora.alertas(AlertaRecordatorios.CONFIGURACION);
      expect(alertas).toHaveLength(1);
      expect(alertas[0]).toMatchObject({
        nivel: 'error',
        campos: { codigo: 'invalid_api_key' },
      });
    });

    it('posible duplicado → enviado SIN id del proveedor y aviso en el log', async () => {
      // Arrange
      const r = vencido();
      canal.responder(posibleDuplicado());

      // Act
      await servicio.enviarLote({ lote: 20 });

      // Assert
      expect(fila(r.id)).toMatchObject({
        estado: EstadoRecordatorio.ENVIADO,
        proveedorMensajeId: null,
        intentos: 1,
      });
      expect(bitacora.de('recordatorio.posible_duplicado')).toHaveLength(1);
    });

    it('si el canal lanza (contrato roto) se trata como transitorio', async () => {
      // Arrange
      const r = vencido();
      canal.responder(new TypeError('boom'));

      // Act
      await servicio.enviarLote({ lote: 20 });

      // Assert
      expect(fila(r.id)).toMatchObject({
        estado: EstadoRecordatorio.PROGRAMADO,
        intentos: 1,
        ultimoError: 'canal:TypeError',
      });
      expect(bitacora.de('recordatorios.canal_lanzo')).toHaveLength(1);
    });

    it('si el canal no responde a tiempo → transitorio (tiempo_agotado)', async () => {
      // Arrange
      servicio = crear({ tiempoMaximoEnvioMs: 10 });
      const r = vencido();
      canal.responder(() => new Promise(() => undefined));

      // Act
      await servicio.enviarLote({ lote: 20 });

      // Assert
      expect(fila(r.id)).toMatchObject({
        estado: EstadoRecordatorio.PROGRAMADO,
        intentos: 1,
        ultimoError: 'tiempo_agotado',
      });
    });
  });

  describe('aviso del 80 % de la cuota (ADR-13 §11)', () => {
    it('al cruzar el umbral diario avisa UNA vez por periodo', async () => {
      // Arrange — 79 de 100 enviados hoy; salen 2 más
      yaEnviados(79, new Date(AHORA.getTime() - HORA));
      vencido();
      vencido({ antelacionMin: 1440 });

      // Act
      await servicio.enviarLote({ lote: 20 });

      // Assert
      const avisos = bitacora.alertas(AlertaRecordatorios.CUOTA_80);
      expect(avisos).toEqual([
        expect.objectContaining({
          nivel: 'warn',
          evento: 'recordatorios.cuota_80',
          campos: { alcance: 'dia', usados: 80, cuota: 100, umbral: 0.8 },
        }),
      ]);
    });

    it('al día siguiente (otro periodo UTC) vuelve a avisar', async () => {
      // Arrange
      servicio = crear({ cuotaDiaria: 2, cuotaMensual: 1000 });
      yaEnviados(1, new Date(AHORA.getTime() - HORA));
      vencido();
      await servicio.enviarLote({ lote: 20 });
      reloj = d('2026-10-11T15:00:00Z');
      yaEnviados(1, new Date(reloj.getTime() - HORA));
      vencido({
        proximoIntentoEn: new Date(reloj.getTime() - MIN),
        venceEn: d('2026-10-12T15:00:00Z'),
        antelacionMin: 1440,
      });

      // Act
      await servicio.enviarLote({ lote: 20 });

      // Assert
      expect(bitacora.alertas(AlertaRecordatorios.CUOTA_80)).toHaveLength(2);
    });
  });

  describe('lote', () => {
    it('una transacción por recordatorio, en orden, con pausa tras cada llamada al proveedor', async () => {
      // Arrange
      const tercero = vencido({ proximoIntentoEn: AHORA });
      const primero = vencido({
        antelacionMin: 1440,
        proximoIntentoEn: new Date(AHORA.getTime() - 3 * MIN),
      });
      const segundo = vencido({
        antelacionMin: 60,
        proximoIntentoEn: new Date(AHORA.getTime() - 2 * MIN),
      });

      // Act
      const resultado = await servicio.enviarLote({ lote: 20 });

      // Assert
      expect(canal.enviados.map((m) => m.etiquetas.recordatorio_id)).toEqual([
        primero.id,
        segundo.id,
        tercero.id,
      ]);
      expect(resultado).toMatchObject({ procesados: 3, enviados: 3 });
      // 3 reclamados + el reclamo vacío que cierra el lote
      expect(transacciones.abiertas).toBe(4);
      // Antes de cada reclamo que sigue a una llamada (fuera de la transacción).
      expect(esperar).toHaveBeenCalledTimes(3);
      expect(esperar).toHaveBeenCalledWith(500);
    });

    it('sin llamadas al proveedor no hay pausas', async () => {
      // Arrange
      lector.actualizarCita(cita.id, { estado: 'cancelada' });
      vencido();
      vencido({ antelacionMin: 1440 });

      // Act
      await servicio.enviarLote({ lote: 20 });

      // Assert
      expect(esperar).not.toHaveBeenCalled();
    });

    it('respeta el tamaño del lote', async () => {
      // Arrange
      vencido();
      vencido({ antelacionMin: 1440 });
      vencido({ antelacionMin: 60 });

      // Act
      const resultado = await servicio.enviarLote({ lote: 2 });

      // Assert
      expect(resultado.procesados).toBe(2);
      expect(canal.enviados).toHaveLength(2);
    });

    it('no toma los que aún no tocan', async () => {
      // Arrange
      vencido({ proximoIntentoEn: new Date(AHORA.getTime() + MIN) });

      // Act
      const resultado = await servicio.enviarLote({ lote: 20 });

      // Assert
      expect(resultado.procesados).toBe(0);
    });

    it('con continuar() = false no reclama nada (apagado ordenado)', async () => {
      // Arrange
      vencido();

      // Act
      const resultado = await servicio.enviarLote({
        lote: 20,
        continuar: () => false,
      });

      // Assert
      expect(resultado).toMatchObject({ procesados: 0, interrumpido: true });
    });

    it('un error interno con una fila: reintento en OTRA transacción y el lote sigue', async () => {
      // Arrange
      const roto = vencido({
        proximoIntentoEn: new Date(AHORA.getTime() - 5 * MIN),
      });
      const sano = vencido({ antelacionMin: 1440 });
      // Solo la primera lectura falla; las demás usan el doble real.
      jest
        .spyOn(lector, 'obtenerDatosEnvio')
        .mockRejectedValueOnce(
          Object.assign(new Error('x'), { name: 'QueryFailedError' }),
        );

      // Act
      const resultado = await servicio.enviarLote({ lote: 20 });

      // Assert
      expect(fila(roto.id)).toMatchObject({
        estado: EstadoRecordatorio.PROGRAMADO,
        intentos: 1,
        ultimoError: 'interno:QueryFailedError',
        proximoIntentoEn: new Date(AHORA.getTime() + MIN),
      });
      expect(fila(sano.id).estado).toBe(EstadoRecordatorio.ENVIADO);
      expect(resultado).toMatchObject({ erroresInternos: 1, enviados: 1 });
    });

    it('si ni siquiera se puede reclamar, lanza (infraestructura)', async () => {
      // Arrange
      jest
        .spyOn(recordatorios, 'reclamarProximoProgramado')
        .mockRejectedValueOnce(new Error('connection refused'));

      // Act & Assert
      await expect(servicio.enviarLote({ lote: 20 })).rejects.toThrow(
        'connection refused',
      );
    });

    it('si falla también el registro del error interno, relanza el error original', async () => {
      // Arrange
      vencido();
      jest
        .spyOn(lector, 'obtenerDatosEnvio')
        .mockRejectedValue(new Error('original'));
      jest
        .spyOn(recordatorios, 'registrarReintento')
        .mockRejectedValue(new Error('secundario'));

      // Act & Assert
      await expect(servicio.enviarLote({ lote: 20 })).rejects.toThrow(
        'original',
      );
    });
  });
});
