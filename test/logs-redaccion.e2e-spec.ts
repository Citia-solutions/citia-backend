// PRIMERO: entorno de test (NODE_ENV=test, PLANIFICADOR_ACTIVO=false y la
// base de test en DB_*), antes de que se arme el ConfigModule.
import './support/entorno-app-e2e';

import { createHash, randomBytes } from 'node:crypto';
import { Writable } from 'node:stream';

import {
  Global,
  INestApplication,
  Module,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Logger, LoggerModule } from 'nestjs-pino';
import request from 'supertest';
import { App } from 'supertest/types';
import { Webhook } from 'svix';
import { DataSource } from 'typeorm';

import { AuthModule } from '../src/modules/auth/auth.module';
import { EnlacesCitaService } from '../src/modules/cita/application/enlaces-cita.service';
import { CitaModule } from '../src/modules/cita/cita.module';
import { PacienteModule } from '../src/modules/paciente/paciente.module';
import { PortalPacienteModule } from '../src/modules/portal-paciente/portal-paciente.module';
import { PlanificadorRecordatorios } from '../src/modules/recordatorio/infrastructure/planificacion/planificador-recordatorios';
import { RecordatorioPlanificacionModule } from '../src/modules/recordatorio/recordatorio-planificacion.module';
import { RecordatorioModule } from '../src/modules/recordatorio/recordatorio.module';
import { SolicitudModule } from '../src/modules/solicitud/solicitud.module';
import { TenantModule } from '../src/modules/tenant/tenant.module';
import { UsuariosModule } from '../src/modules/usuario/usuarios.module';
import { Latidos } from '../src/shared/application/latidos';
import { TransactionRunner } from '../src/shared/application/transaction-runner';
import { validarEntorno } from '../src/shared/infrastructure/config/entorno';
import { LatidosBetterStack } from '../src/shared/infrastructure/observabilidad/latidos-better-stack';
import { crearParamsLogger } from '../src/shared/infrastructure/observabilidad/opciones-logger';
import { PlanificadorSalida } from '../src/shared/infrastructure/planificacion/planificador-salida';
import { PlanificacionModule } from '../src/shared/planificacion.module';

/**
 * Redacción de logs con peticiones REALES (DoD de US-03, "Privacidad";
 * ADR-13 §12 y §16): la app con los módulos de `AppModule`, pino con la
 * configuración de producción (`crearParamsLogger`, JSON, nivel `trace`) y
 * `app.useLogger` como en `main.ts`, escribiendo a un stream en memoria.
 *
 * Recorre lo que toca datos personales: registro y login (también fallido),
 * solicitud pública (con un `X-Enlace-Cita` como el del portal del paciente,
 * Fase 3), `POST /citas` con paciente en línea (y uno inválido),
 * `PATCH /pacientes/:id`, `PUT` de configuración con contacto, el outbox, el
 * job de envío (que arma el mensaje con destinatario y cuerpo y EMITE el
 * enlace del paciente), webhooks firmados (válido, queja y firma inválida) y
 * las rutas REALES del portal del paciente (`/api/publico/cita*`) con el
 * token verdadero de ese enlace: ver, pedir otra hora, confirmar (409),
 * cancelar y un enlace inválido. Después busca en TODO lo escrito: correo,
 * RUT, teléfono, nombre del paciente, tipo de consulta, contacto del
 * profesional, credenciales, cuerpo del mensaje, firma, y el token del enlace
 * y su hash (también en el payload del outbox).
 *
 * ⚠️ REQUIERE PostgreSQL real (vars TEST_DB_*), con synchronize + dropSchema.
 */

process.env.MENSAJERIA_ADAPTADOR = 'registro';
const SECRETO_WEBHOOK = `whsec_${randomBytes(24).toString('base64')}`;
process.env.RESEND_WEBHOOK_SECRET = SECRETO_WEBHOOK;

// Horas sin envío LEJOS de ahora (6 a 7 h más tarde, hora de Santiago), como
// en recordatorios-flujo: el job de envío debe llegar a armar el mensaje.
const TZ = 'America/Santiago';
const MIN = 60_000;
const HORA = 60 * MIN;
const horaLocal = (instante: Date): string =>
  `${new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    hour: '2-digit',
    hourCycle: 'h23',
  }).format(instante)}:00`;
const ARRANQUE = new Date();
process.env.APP_TZ = TZ;
process.env.RECORDATORIO_SILENCIO_DESDE = horaLocal(
  new Date(ARRANQUE.getTime() + 6 * HORA),
);
process.env.RECORDATORIO_SILENCIO_HASTA = horaLocal(
  new Date(ARRANQUE.getTime() + 7 * HORA),
);

// --- Datos sensibles de prueba: NINGUNO puede aparecer en los logs ----------
const PROFESIONAL = {
  nombreTenant: 'Clinica Logs Redaccion',
  email: 'profesional.secreta@clinica-logs.cl',
  password: 'clave-super-secreta-123',
  nombreCompleto: 'Dra. Profesional Secretisima',
};
const PACIENTE = {
  nombre: 'María José Pérez Soto',
  rut: '12.345.678-5',
  telefono: '+56 9 8765 4321',
  correo: 'maria.perez@correo-secreto.cl',
  consentimiento: true,
};
const TIPO_CONSULTA = 'Control psiquiátrico';
// Token del enlace del paciente (Fase 3): 43 caracteres base64url.
const ENLACE_CITA = 'EnlaceCitaSecreto_0123456789-abcdefghijklmn';
const PATCH_PACIENTE = { telefono: '+56 9 1234 0000' };
const CONTACTO = {
  telefonoContacto: '+56 2 2999 8888',
  correoRespuesta: 'consultas.secretas@clinica-logs.cl',
};
const SOLICITANTE = {
  rut: '11.111.111-1',
  nombrePaciente: 'Juan Solicitante Ramírez',
  telefono: '+56 9 7777 6666',
  correo: 'juan.solicitante@correo-secreto.cl',
  motivo: 'Dolor de espalda hace meses',
  preferenciaHoraria: 'jueves en la tarde',
  consentimiento: true,
};
// Lo que el paciente escribe en el portal (Fase 3): tampoco va a los logs.
const PETICION_OTRA_HORA = {
  preferencia: 'Preferencia secreta: viernes temprano',
  motivo: 'Motivo secreto de reagendar',
};
const MOTIVO_CANCELACION = 'Motivo secreto de cancelar';

// --- Salida de pino en memoria -----------------------------------------------
const trozos: string[] = [];
const destino = new Writable({
  write(chunk: Buffer, _codificacion, listo) {
    trozos.push(chunk.toString());
    listo();
  },
});
const textoLogs = (): string => trozos.join('');

interface LineaLog {
  level: string;
  msg?: string;
  evento?: string;
  reqId?: string;
  req?: { id?: string; headers?: Record<string, unknown> };
  [campo: string]: unknown;
}
const lineas = (): LineaLog[] =>
  textoLogs()
    .split('\n')
    .filter((l) => l.trim() !== '')
    .map((l) => JSON.parse(l) as LineaLog);

/** `ObservabilidadModule` de prueba: el logger de producción hacia `destino`, sin latidos reales. */
@Global()
@Module({
  imports: [
    LoggerModule.forRoot(
      crearParamsLogger({ LOG_NIVEL: 'trace', LOG_FORMATO: 'json' }, destino),
    ),
  ],
  providers: [{ provide: Latidos, useValue: new LatidosBetterStack({}) }],
  exports: [Latidos],
})
class ObservabilidadDePruebaModule {}

interface RecordatorioBody {
  id: string;
  estado: string;
}

describe('Logs: redacción de datos personales en peticiones reales (e2e con Postgres)', () => {
  let app: INestApplication;
  let token: string;
  let tenantSlug: string;
  // Token REAL del enlace del paciente (el del correo) y su hash.
  let enlacePaciente: string;
  let hashEnlacePaciente: string;
  const firmas: string[] = [];

  const server = (): App => app.getHttpServer() as App;
  const autenticado = (r: request.Test) =>
    r.set('Authorization', `Bearer ${token}`);

  const webhook = (cuerpo: string, firmaValida = true) => {
    const id = `msg_${randomBytes(6).toString('hex')}`;
    const ahora = new Date();
    const firma = firmaValida
      ? new Webhook(SECRETO_WEBHOOK).sign(id, ahora, cuerpo)
      : `v1,${randomBytes(32).toString('base64')}`;
    firmas.push(firma.replace(/^v1,/, ''));
    return request(server())
      .post('/api/webhooks/resend')
      .set('Content-Type', 'application/json')
      .set({
        'svix-id': id,
        'svix-timestamp': String(Math.floor(ahora.getTime() / 1000)),
        'svix-signature': firma,
      })
      .send(cuerpo);
  };

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, validate: validarEntorno }),
        ObservabilidadDePruebaModule,
        TypeOrmModule.forRoot({
          type: 'postgres',
          host: process.env.DB_HOST,
          port: Number(process.env.DB_PORT),
          username: process.env.DB_USER,
          password: process.env.DB_PASS,
          database: process.env.DB_NAME,
          autoLoadEntities: true,
          synchronize: true, // SOLO aquí: BD efímera de test
          dropSchema: true,
        }),
        AuthModule,
        TenantModule,
        UsuariosModule,
        PacienteModule,
        CitaModule,
        SolicitudModule,
        RecordatorioModule,
        PortalPacienteModule,
        PlanificacionModule,
        RecordatorioPlanificacionModule,
      ],
    }).compile();

    // Igual que src/main.ts.
    app = moduleFixture.createNestApplication({ rawBody: true });
    app.useLogger(app.get(Logger));
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();

    // --- El recorrido -------------------------------------------------------
    const registro = await request(server())
      .post('/api/usuarios')
      .send(PROFESIONAL)
      .expect(201);
    tenantSlug = (registro.body as { tenantSlug: string }).tenantSlug;
    const tenantId = (registro.body as { tenantId: string }).tenantId;

    await request(server())
      .post('/api/auth/login')
      .send({
        tenantSlug,
        email: PROFESIONAL.email,
        password: 'otra-clave-mala',
      })
      .expect(401);
    const login = await request(server())
      .post('/api/auth/login')
      .send({
        tenantSlug,
        email: PROFESIONAL.email,
        password: PROFESIONAL.password,
      })
      .expect(200);
    token = (login.body as { accessToken: string }).accessToken;

    await request(server())
      .post(`/api/publico/${tenantSlug}/solicitudes`)
      .set('X-Enlace-Cita', ENLACE_CITA)
      .send(SOLICITANTE)
      .expect(202);

    await autenticado(
      request(server())
        .put('/api/recordatorios/configuracion')
        .send({ activo: true, antelacionesMin: [1440, 120], ...CONTACTO }),
    ).expect(200);

    // Paciente en línea sin correo → 400 (con el resto de los datos)
    await autenticado(
      request(server())
        .post('/api/citas')
        .send({
          inicio: new Date(Date.now() + 2 * HORA).toISOString(),
          duracionMin: 45,
          tipoConsulta: TIPO_CONSULTA,
          paciente: { ...PACIENTE, correo: undefined },
        }),
    ).expect(400);

    // Cita en ~90 min: un recordatorio tardío que el job envía enseguida
    const inicio = new Date(Math.ceil((Date.now() + 90 * MIN) / MIN) * MIN);
    const cita = await autenticado(
      request(server()).post('/api/citas').send({
        inicio: inicio.toISOString(),
        duracionMin: 45,
        tipoConsulta: TIPO_CONSULTA,
        paciente: PACIENTE,
      }),
    ).expect(201);
    const { id: citaId, pacienteId } = cita.body as {
      id: string;
      pacienteId: string;
    };

    await autenticado(
      request(server())
        .patch(`/api/pacientes/${pacienteId}`)
        .send(PATCH_PACIENTE),
    ).expect(200);

    await app.get(PlanificadorSalida).ejecutarDespacho();
    await app.get(PlanificadorRecordatorios).ejecutarEnvio();

    const estado = await autenticado(
      request(server()).get(`/api/citas/${citaId}/recordatorios`),
    ).expect(200);
    const enviado = (estado.body as RecordatorioBody[]).find(
      (r) => r.estado === 'enviado',
    );
    if (!enviado) throw new Error('el job no envió el recordatorio tardío');

    const evento = (type: string) =>
      JSON.stringify({
        type,
        created_at: new Date().toISOString(),
        data: {
          email_id: `registro_recordatorio_${enviado.id}`,
          to: [PACIENTE.correo],
          subject: 'Recordatorio de tu hora',
          tags: { recordatorio_id: enviado.id },
        },
      });
    await webhook(evento('email.delivered')).expect(200);
    await webhook(evento('email.complained')).expect(200);
    await webhook(evento('email.delivered'), false).expect(400);

    // --- Portal del paciente (Fase 3) con el token REAL del correo ----------
    // El envío ya emitió el enlace: `asegurarActivo` devuelve el MISMO token
    // que llevó el correo (no emite otro).
    enlacePaciente = await app
      .get(TransactionRunner)
      .run((tx) =>
        app.get(EnlacesCitaService).asegurarActivo(citaId, tenantId, tx),
      );
    hashEnlacePaciente = createHash('sha256')
      .update(enlacePaciente)
      .digest('hex');
    const portal = (metodo: 'get' | 'post', ruta: string, enlace?: string) => {
      const peticion = request(server())[metodo](`/api/publico/cita${ruta}`);
      return enlace === undefined
        ? peticion
        : peticion.set('X-Enlace-Cita', enlace);
    };
    await portal('get', '', enlacePaciente).expect(200);
    await portal('post', '/otra-hora', enlacePaciente)
      .send(PETICION_OTRA_HORA)
      .expect(201);
    await portal('post', '/confirmar', enlacePaciente).expect(409);
    // Un cuerpo inválido (400) con el token real en la cabecera
    await portal('post', '/otra-hora', enlacePaciente)
      .send({ preferencia: '' })
      .expect(400);
    await portal('post', '/cancelar', enlacePaciente)
      .send({ motivo: MOTIVO_CANCELACION })
      .expect(200);
    // Ya cancelada: el mismo token da 404; uno inexistente, también
    await portal('get', '', enlacePaciente).expect(404);
    await portal('post', '/confirmar', 'Z'.repeat(43)).expect(404);
    // Los hechos del portal (ReagendamientoSolicitado, CitaCancelada) a los
    // suscriptores (recordatorios, solicitudes)
    await app.get(PlanificadorSalida).ejecutarDespacho();

    // pino-http escribe la línea de la respuesta al terminar de enviarla.
    await new Promise((resolver) => setTimeout(resolver, 100));
  }, 60_000);

  afterAll(async () => {
    await app?.close();
  });

  it('debería haber capturado los logs del recorrido (el test no es vacío)', () => {
    // Arrange
    const todas = lineas();
    const mensajes = todas.map((l) => l.msg ?? '');
    const eventos = todas.map((l) => l.evento);

    // Assert — respuestas HTTP con su id de petición…
    for (const esperado of [
      'POST /api/usuarios 201',
      'POST /api/auth/login 401',
      'POST /api/auth/login 200',
      `POST /api/publico/${tenantSlug}/solicitudes 202`,
      'PUT /api/recordatorios/configuracion 200',
      'POST /api/citas 400',
      'POST /api/citas 201',
      'POST /api/webhooks/resend 200',
      'POST /api/webhooks/resend 400',
      // Fase 3: el portal del paciente
      'GET /api/publico/cita 200',
      'POST /api/publico/cita/otra-hora 201',
      'POST /api/publico/cita/confirmar 409',
      'POST /api/publico/cita/otra-hora 400',
      'POST /api/publico/cita/cancelar 200',
      'GET /api/publico/cita 404',
      'POST /api/publico/cita/confirmar 404',
    ]) {
      expect(mensajes).toContain(esperado);
    }
    const http = todas.filter((l) => l.req);
    expect(http.every((l) => typeof l.req?.id === 'string')).toBe(true);
    // …y los eventos de los casos de uso y jobs
    expect(eventos).toEqual(
      expect.arrayContaining([
        'mensajeria.registro',
        'recordatorio.enviado',
        'recordatorio.entrega',
        'recordatorios.webhook_rechazado',
      ]),
    );
  });

  it('las peticiones registradas no llevan cabeceras de credenciales ni firma', () => {
    const cabeceras = lineas()
      .filter((l) => l.req?.headers)
      .flatMap((l) => Object.keys(l.req?.headers ?? {}));

    expect(cabeceras.length).toBeGreaterThan(0);
    for (const prohibida of [
      'authorization',
      'cookie',
      'x-enlace-cita',
      'svix-id',
      'svix-timestamp',
      'svix-signature',
    ]) {
      expect(cabeceras).not.toContain(prohibida);
    }
  });

  it.each([
    ['correo del paciente', PACIENTE.correo],
    ['RUT con formato', PACIENTE.rut],
    ['RUT canónico', '123456785'],
    ['RUT sin verificador', '12345678'],
    ['teléfono del paciente', PACIENTE.telefono],
    ['teléfono del paciente (dígitos)', '87654321'],
    ['teléfono nuevo del paciente', PATCH_PACIENTE.telefono],
    ['nombre del paciente', PACIENTE.nombre],
    ['apellidos del paciente', 'Pérez Soto'],
    ['tipo de consulta', TIPO_CONSULTA],
    ['correo del solicitante', SOLICITANTE.correo],
    ['RUT del solicitante', SOLICITANTE.rut],
    ['nombre del solicitante', SOLICITANTE.nombrePaciente],
    ['teléfono del solicitante', SOLICITANTE.telefono],
    ['motivo del solicitante', SOLICITANTE.motivo],
    ['teléfono de contacto del profesional', CONTACTO.telefonoContacto],
    ['correo de respuesta del profesional', CONTACTO.correoRespuesta],
    ['correo de acceso del profesional', PROFESIONAL.email],
    ['contraseña', PROFESIONAL.password],
    ['contraseña equivocada', 'otra-clave-mala'],
    ['nombre del profesional', PROFESIONAL.nombreCompleto],
    ['asunto del correo', 'Recordatorio de tu hora'],
    ['cuerpo del correo (texto)', 'aviso automático'],
    ['cuerpo del correo (HTML)', '<p style'],
    ['secreto del webhook', SECRETO_WEBHOOK],
    ['token del enlace del paciente (X-Enlace-Cita)', ENLACE_CITA],
    ['enlace inexistente probado en el portal', 'Z'.repeat(43)],
    ['preferencia de otra hora', PETICION_OTRA_HORA.preferencia],
    ['motivo de otra hora', PETICION_OTRA_HORA.motivo],
    ['motivo de cancelación del paciente', MOTIVO_CANCELACION],
    ['URL del enlace en el correo', '/cita#'],
  ])('no debería aparecer: %s', (_que, secreto) => {
    expect(textoLogs().toLowerCase()).not.toContain(secreto.toLowerCase());
  });

  it('el token REAL del enlace del paciente (el del correo) y su hash no aparecen en ninguna línea', () => {
    // Arrange — es el que emitió el envío: un solo enlace, versión 1
    expect(enlacePaciente).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const texto = textoLogs();

    // Assert — ni en claro, ni hasheado (tampoco en minúsculas: es
    // case-sensitive, pero se busca así por si algo lo normaliza)
    for (const linea of texto.split('\n')) {
      expect(linea).not.toContain(enlacePaciente);
      expect(linea.toLowerCase()).not.toContain(enlacePaciente.toLowerCase());
      expect(linea).not.toContain(hashEnlacePaciente);
    }
  });

  it('el enlace que usó el portal es el que emitió el envío (no otro) y ni el token ni su hash viajan en el outbox', async () => {
    // Arrange
    const datos = app.get(DataSource);

    // Act
    const enlaces = await datos.query<{ version: number; tokenHash: string }[]>(
      `SELECT version, token_hash AS "tokenHash" FROM enlaces_cita
        ORDER BY version`,
    );
    const hechos = await datos.query<{ nombre: string; payload: string }[]>(
      'SELECT nombre, payload::text AS payload FROM eventos_salida',
    );

    // Assert — un solo enlace (versión 1) y es el del token usado
    expect(enlaces).toEqual([{ version: 1, tokenHash: hashEnlacePaciente }]);
    // Los hechos del portal están…
    const nombres = hechos.map((h) => h.nombre);
    expect(nombres).toEqual(
      expect.arrayContaining(['ReagendamientoSolicitado', 'CitaCancelada']),
    );
    // …pero ningún payload lleva el token, su hash ni lo que escribió el paciente
    for (const { payload } of hechos) {
      expect(payload).not.toContain(enlacePaciente);
      expect(payload).not.toContain(hashEnlacePaciente);
      expect(payload).not.toContain(PETICION_OTRA_HORA.preferencia);
      expect(payload).not.toContain(MOTIVO_CANCELACION);
    }
  });

  it('no debería aparecer el token JWT ni ninguna firma Svix', () => {
    const texto = textoLogs();
    expect(token.length).toBeGreaterThan(20);
    expect(texto).not.toContain(token);
    expect(firmas).toHaveLength(3);
    for (const firma of firmas) {
      expect(texto).not.toContain(firma);
    }
  });
});
