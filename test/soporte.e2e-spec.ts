// PRIMERO: entorno de test (NODE_ENV=test, PLANIFICADOR_ACTIVO=false y la
// base de test en DB_*), antes de que se arme el ConfigModule.
import './support/entorno-app-e2e';

import { Writable } from 'node:stream';

import {
  Global,
  INestApplication,
  Module,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule, SchedulerRegistry } from '@nestjs/schedule';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Logger, LoggerModule } from 'nestjs-pino';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';

import { AuthModule } from '../src/modules/auth/auth.module';
import { CanalMensajeria } from '../src/modules/recordatorio/domain/canal-mensajeria';
import {
  CRON_SOPORTE_ENVIO,
  PlanificadorSoporte,
} from '../src/modules/soporte/infrastructure/planificacion/planificador-soporte';
import { SoportePlanificacionModule } from '../src/modules/soporte/soporte-planificacion.module';
import { SoporteModule } from '../src/modules/soporte/soporte.module';
import { TenantModule } from '../src/modules/tenant/tenant.module';
import { UsuariosModule } from '../src/modules/usuario/usuarios.module';
import { Latidos } from '../src/shared/application/latidos';
import { validarEntorno } from '../src/shared/infrastructure/config/entorno';
import { LatidosBetterStack } from '../src/shared/infrastructure/observabilidad/latidos-better-stack';
import { crearParamsLogger } from '../src/shared/infrastructure/observabilidad/opciones-logger';
import { CanalMensajeriaFalso } from './support/mensajeria-falsa';

/**
 * Mensajes a soporte de punta a punta (US-10, ADR-15 §7; Definición de
 * Terminado, `test/soporte.e2e-spec.ts`):
 *
 *   POST /api/soporte/mensajes → 201 y fila `pendiente`
 *   400 (2001 caracteres, en blanco, categoría inválida) · 401 sin token
 *   el sexto de la organización en 24 h → 429 con su mensaje
 *   job `soporte.envio` a mano (`ejecutarEnvio()`) con `CanalMensajeriaFalso`
 *     → `enviado`; destinatario = SOPORTE_CORREO_DESTINO, Reply-To = correo
 *       del profesional, Idempotency-Key `soporte/<id>`
 *   los logs (pino real, con redacción) no contienen el texto
 *
 * Con `PLANIFICADOR_ACTIVO=false` (entorno-app-e2e) el cron no se registra:
 * el job se invoca a mano.
 *
 * ⚠️ REQUIERE PostgreSQL real (vars TEST_DB_*), con synchronize + dropSchema.
 */

const DESTINO = 'soporte@citia-e2e.cl';
process.env.SOPORTE_CORREO_DESTINO = DESTINO;
process.env.MENSAJERIA_ADAPTADOR = 'registro';

const PROFESIONAL = {
  nombreTenant: 'Clinica Soporte E2E',
  email: 'dra.soporte@clinica-e2e.cl',
  password: 'password1234',
  nombreCompleto: 'Dra. Soporte E2E',
};
// Lo que NO debe aparecer en ningún log.
const TEXTO_SECRETO =
  'Mi paciente Ignacio Secretísimo (RUT 9.876.543-2) no recibió el recordatorio';

// --- Salida de pino en memoria -----------------------------------------------
const trozos: string[] = [];
const destinoLogs = new Writable({
  write(chunk: Buffer, _codificacion, listo) {
    trozos.push(chunk.toString());
    listo();
  },
});
const textoLogs = (): string => trozos.join('');

interface LineaLog {
  evento?: string;
  [campo: string]: unknown;
}
const lineas = (): LineaLog[] =>
  textoLogs()
    .split('\n')
    .filter((l) => l.trim() !== '')
    .map((l) => JSON.parse(l) as LineaLog);

/** El logger de producción hacia `destinoLogs`, sin latidos reales. */
@Global()
@Module({
  imports: [
    LoggerModule.forRoot(
      crearParamsLogger(
        { LOG_NIVEL: 'trace', LOG_FORMATO: 'json' },
        destinoLogs,
      ),
    ),
  ],
  providers: [{ provide: Latidos, useValue: new LatidosBetterStack({}) }],
  exports: [Latidos],
})
class ObservabilidadDePruebaModule {}

interface CreadoBody {
  id: string;
  creadoEn: string;
}

describe('Soporte: POST /api/soporte/mensajes y job soporte.envio (e2e con Postgres)', () => {
  let app: INestApplication;
  let token: string;
  const canal = new CanalMensajeriaFalso();
  const creados: string[] = [];

  const server = (): App => app.getHttpServer() as App;
  const enviar = (cuerpo: Record<string, unknown>, conToken = true) => {
    const peticion = request(server()).post('/api/soporte/mensajes');
    return (
      conToken ? peticion.set('Authorization', `Bearer ${token}`) : peticion
    ).send(cuerpo);
  };
  const fila = async (
    id: string,
  ): Promise<{
    estado_envio: string;
    tenant_id: string;
    categoria: string;
  }> => {
    const [f] = await app
      .get(DataSource)
      .query<
        { estado_envio: string; tenant_id: string; categoria: string }[]
      >('SELECT estado_envio, tenant_id, categoria FROM mensajes_soporte WHERE id = $1', [id]);
    return f;
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
        // SchedulerRegistry para el planificador (en la app lo trae
        // PlanificacionModule).
        ScheduleModule.forRoot(),
        AuthModule,
        TenantModule,
        UsuariosModule,
        SoporteModule,
        SoportePlanificacionModule,
      ],
    })
      // El canal de SoporteModule (sin RecordatorioModule cargado: es el único).
      .overrideProvider(CanalMensajeria)
      .useValue(canal)
      .compile();

    // Igual que src/main.ts.
    app = moduleFixture.createNestApplication();
    app.useLogger(app.get(Logger));
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();

    const registro = await request(server())
      .post('/api/usuarios')
      .send(PROFESIONAL)
      .expect(201);
    const { tenantSlug } = registro.body as { tenantSlug: string };
    const login = await request(server())
      .post('/api/auth/login')
      .send({
        tenantSlug,
        email: PROFESIONAL.email,
        password: PROFESIONAL.password,
      })
      .expect(200);
    token = (login.body as { accessToken: string }).accessToken;
  });

  afterAll(async () => {
    await app?.close();
  });

  it('con PLANIFICADOR_ACTIVO=false no registra soporte.envio', () => {
    expect(
      app.get(SchedulerRegistry).doesExist('cron', CRON_SOPORTE_ENVIO),
    ).toBe(false);
  });

  it('sin token → 401', async () => {
    await enviar({ mensaje: 'Hola' }, false).expect(401);
  });

  it('POST → 201 { id, creadoEn } y la fila queda pendiente, en la organización del token', async () => {
    // Act — un tenantId en el cuerpo se descarta (whitelist)
    const res = await enviar({
      categoria: 'problema',
      mensaje: `  ${TEXTO_SECRETO}  `,
      tenantId: '00000000-0000-4000-8000-000000000000',
    }).expect(201);

    // Assert
    const cuerpo = res.body as CreadoBody;
    expect(Object.keys(cuerpo).sort()).toEqual(['creadoEn', 'id']);
    expect(new Date(cuerpo.creadoEn).toString()).not.toBe('Invalid Date');
    creados.push(cuerpo.id);
    const guardada = await fila(cuerpo.id);
    expect(guardada.estado_envio).toBe('pendiente');
    expect(guardada.categoria).toBe('problema');
    expect(guardada.tenant_id).not.toBe('00000000-0000-4000-8000-000000000000');
  });

  it.each<[string, Record<string, unknown>]>([
    ['2001 caracteres', { mensaje: 'a'.repeat(2001) }],
    ['un texto en blanco', { mensaje: '   \n  ' }],
    ['sin mensaje', {}],
    ['una categoría inválida', { categoria: 'urgente', mensaje: 'Hola' }],
  ])('%s → 400 sin guardar nada', async (_caso, cuerpo) => {
    // Arrange
    const [{ n: antes }] = await app
      .get(DataSource)
      .query<
        { n: number }[]
      >('SELECT count(*)::int AS n FROM mensajes_soporte');

    // Act
    await enviar(cuerpo).expect(400);

    // Assert
    const [{ n: despues }] = await app
      .get(DataSource)
      .query<
        { n: number }[]
      >('SELECT count(*)::int AS n FROM mensajes_soporte');
    expect(despues).toBe(antes);
  });

  it('categoría ausente → otro', async () => {
    const res = await enviar({ mensaje: 'Sin categoría' }).expect(201);
    const { id } = res.body as CreadoBody;
    creados.push(id);
    expect((await fila(id)).categoria).toBe('otro');
  });

  it('el sexto de la organización en 24 h → 429 con su mensaje, sin guardar', async () => {
    // Arrange — ya hay 2; tres más llegan a 5
    for (let i = 0; i < 3; i++) {
      const res = await enviar({ mensaje: `Mensaje ${i + 3}` }).expect(201);
      creados.push((res.body as CreadoBody).id);
    }

    // Act
    const res = await enviar({ mensaje: 'El sexto' }).expect(429);

    // Assert
    expect(res.body).toEqual({
      statusCode: 429,
      message:
        'Ya enviaste 5 mensajes a soporte en las últimas 24 horas. Vuelve a intentarlo más tarde.',
    });
    const [{ n }] = await app
      .get(DataSource)
      .query<
        { n: number }[]
      >('SELECT count(*)::int AS n FROM mensajes_soporte');
    expect(n).toBe(5);
  });

  it('el job (a mano) los envía: destino = la variable, Reply-To = el profesional, clave soporte/<id>', async () => {
    // Act
    await app.get(PlanificadorSoporte).ejecutarEnvio();

    // Assert
    expect(canal.enviados).toHaveLength(5);
    for (const id of creados) {
      expect((await fila(id)).estado_envio).toBe('enviado');
      const saliente = canal.enviados.find(
        (m) => m.claveIdempotencia === `soporte/${id}`,
      );
      expect(saliente).toMatchObject({
        destinatario: DESTINO,
        responderA: PROFESIONAL.email,
        etiquetas: { mensaje_soporte_id: id },
      });
    }
    // El correo sí lleva el texto (va a la casilla de soporte)
    const primero = canal.enviados.find(
      (m) => m.claveIdempotencia === `soporte/${creados[0]}`,
    );
    expect(primero?.texto).toContain(TEXTO_SECRETO);
    expect(primero?.asunto).toBe('Soporte · Problema · Clinica Soporte E2E');

    // Un segundo tick no reenvía nada
    await app.get(PlanificadorSoporte).ejecutarEnvio();
    expect(canal.enviados).toHaveLength(5);
  });

  it('los logs tienen los eventos (solo ids) y NUNCA el texto del mensaje', () => {
    // Assert — los eventos esperados
    const eventos = lineas().map((l) => l.evento);
    expect(eventos).toEqual(
      expect.arrayContaining([
        'soporte.mensaje_recibido',
        'soporte.tope_diario',
        'soporte.envio',
      ]),
    );
    const recibido = lineas().find(
      (l) => l.evento === 'soporte.mensaje_recibido',
    );
    expect(recibido).toMatchObject({
      mensajeId: creados[0],
      categoria: 'problema',
    });

    // …y nada del texto, ni siquiera un pedazo
    const todo = textoLogs();
    expect(todo).not.toContain(TEXTO_SECRETO);
    expect(todo).not.toContain('Secretísimo');
    expect(todo).not.toContain('9.876.543-2');
  });
});
