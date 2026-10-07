import { randomBytes, randomUUID } from 'node:crypto';

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { Webhook } from 'svix';

import { JwtAuthGuard } from '../src/modules/auth/jwt-auth.guard';
import { JwtPayload } from '../src/modules/auth/jwt-payload.interface';
import { JwtStrategy } from '../src/modules/auth/jwt.strategy';
import { ConfiguracionRecordatoriosService } from '../src/modules/recordatorio/application/configuracion-recordatorios.service';
import { ConsultarRecordatoriosService } from '../src/modules/recordatorio/application/consultar-recordatorios.service';
import { ProcesarWebhookEntregaService } from '../src/modules/recordatorio/application/procesar-webhook-entrega.service';
import {
  EstadoRecordatorio,
  MotivoRecordatorio,
} from '../src/modules/recordatorio/domain/recordatorio.entity';
import { VerificadorWebhookResend } from '../src/modules/recordatorio/infrastructure/mensajeria/verificador-webhook-resend';
import { ConfiguracionRecordatoriosController } from '../src/modules/recordatorio/presentation/configuracion-recordatorios.controller';
import { RecordatoriosCitaController } from '../src/modules/recordatorio/presentation/recordatorios-cita.controller';
import { WebhooksResendController } from '../src/modules/recordatorio/presentation/webhooks-resend.controller';
import { RolUsuario } from '../src/modules/usuario/domain/usuario.entity';
import {
  ContadorTransacciones,
  PublicadorEnMemoria,
} from './support/in-memory-repositories';
import { BitacoraEnMemoria } from './support/mensajeria-falsa';
import {
  ConfiguracionRecordatorioRepositoryEnMemoria,
  LectorCitasEnMemoria,
  RecordatorioRepositoryEnMemoria,
  SupresionCorreoRepositoryEnMemoria,
  citaLeida,
} from './support/recordatorios-en-memoria';

/**
 * Rutas de recordatorios (ADR-13 §17) SIN base de datos: pila HTTP real
 * (prefijo `api`, ValidationPipe global, JwtAuthGuard + JwtStrategy reales,
 * `rawBody: true` como en `main.ts`, controllers y servicios reales) sobre los
 * dobles en memoria de los puertos. Fija el CONTRATO que consume el frontend.
 *
 * El flujo completo contra Postgres (outbox, reconciliación, envío) está en
 * `recordatorios-flujo.e2e-spec.ts`.
 */

process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret-e2e';

const SECRETO_WEBHOOK = `whsec_${randomBytes(24).toString('base64')}`;
const TENANT_A = randomUUID();
const TENANT_B = randomUUID();
const USUARIO_A = randomUUID();
const INICIO = new Date('2026-10-14T13:30:00Z');

interface ConfiguracionBody {
  activo: boolean;
  canal: string;
  antelacionesMin: number[];
  telefonoContacto: string | null;
  correoRespuesta: string | null;
  predeterminada: boolean;
}

interface ErrorBody {
  statusCode: number;
  message: string | string[];
}

describe('Recordatorios: rutas HTTP (e2e sin BD)', () => {
  let app: INestApplication;
  let jwt: JwtService;
  let tokenA: string;
  let tokenB: string;

  const recordatorios = new RecordatorioRepositoryEnMemoria();
  const configuraciones = new ConfiguracionRecordatorioRepositoryEnMemoria();
  const supresiones = new SupresionCorreoRepositoryEnMemoria();
  const lector = new LectorCitasEnMemoria(recordatorios);
  const eventos = new PublicadorEnMemoria();
  const transacciones = new ContadorTransacciones();

  const server = (): App => app.getHttpServer() as App;

  const firmar = (sub: string, tenantId: string): Promise<string> =>
    jwt.signAsync({
      sub,
      email: `${sub}@demo.com`,
      tenantId,
      rol: RolUsuario.PROFESIONAL,
    } satisfies JwtPayload);

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        PassportModule,
        JwtModule.registerAsync({
          inject: [ConfigService],
          useFactory: (config: ConfigService) => ({
            secret: config.getOrThrow<string>('JWT_SECRET'),
          }),
        }),
      ],
      controllers: [
        ConfiguracionRecordatoriosController,
        RecordatoriosCitaController,
        WebhooksResendController,
      ],
      providers: [
        JwtStrategy,
        JwtAuthGuard,
        {
          provide: ConfiguracionRecordatoriosService,
          useFactory: () =>
            new ConfiguracionRecordatoriosService(
              transacciones,
              configuraciones,
              eventos,
              [1440, 120],
            ),
        },
        {
          provide: ConsultarRecordatoriosService,
          useFactory: () =>
            new ConsultarRecordatoriosService(
              transacciones,
              lector,
              recordatorios,
            ),
        },
        {
          provide: ProcesarWebhookEntregaService,
          useFactory: () =>
            new ProcesarWebhookEntregaService(
              transacciones,
              recordatorios,
              supresiones,
              new BitacoraEnMemoria(),
            ),
        },
        {
          provide: VerificadorWebhookResend,
          useFactory: () => new VerificadorWebhookResend(SECRETO_WEBHOOK),
        },
      ],
    }).compile();

    // Igual que src/main.ts.
    app = moduleFixture.createNestApplication({ rawBody: true });
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();

    jwt = app.get(JwtService);
    tokenA = await firmar(USUARIO_A, TENANT_A);
    tokenB = await firmar(randomUUID(), TENANT_B);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET/PUT /api/recordatorios/configuracion', () => {
    it('sin token → 401', async () => {
      await request(server())
        .get('/api/recordatorios/configuracion')
        .expect(401);
      await request(server())
        .put('/api/recordatorios/configuracion')
        .send({ activo: true, antelacionesMin: [120] })
        .expect(401);
    });

    it('GET sin configuración guardada → la predeterminada', async () => {
      // Act
      const res = await request(server())
        .get('/api/recordatorios/configuracion')
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(200);

      // Assert
      expect(res.body).toEqual({
        activo: true,
        canal: 'email',
        antelacionesMin: [1440, 120],
        telefonoContacto: null,
        correoRespuesta: null,
        predeterminada: true,
      });
    });

    it('PUT válido → 200, normalizado, y publica ConfiguracionRecordatorioActualizada', async () => {
      // Act
      const res = await request(server())
        .put('/api/recordatorios/configuracion')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          activo: true,
          antelacionesMin: [120, 2880],
          telefonoContacto: ' +56 9 1234 5678 ',
          correoRespuesta: ' Consulta@Ana.CL ',
          // Ignorados (whitelist): el dueño sale del token.
          usuarioId: randomUUID(),
          tenantId: TENANT_B,
        })
        .expect(200);

      // Assert
      expect(res.body).toEqual({
        activo: true,
        canal: 'email',
        antelacionesMin: [2880, 120],
        telefonoContacto: '+56 9 1234 5678',
        correoRespuesta: 'consulta@ana.cl',
        predeterminada: false,
      });
      expect(eventos.eventos.at(-1)).toMatchObject({
        nombre: 'ConfiguracionRecordatorioActualizada',
        tenantId: TENANT_A,
        payload: { usuarioId: USUARIO_A },
      });
      const get = await request(server())
        .get('/api/recordatorios/configuracion')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);
      expect((get.body as ConfiguracionBody).predeterminada).toBe(false);
    });

    it.each([
      [{ antelacionesMin: [120] }, 'activo'],
      [{ activo: true, antelacionesMin: [] }, 'antelacionesMin'],
      [{ activo: true, antelacionesMin: [120, 120] }, 'antelacionesMin'],
      [{ activo: true, antelacionesMin: [10, 20] }, 'antelacionesMin'],
      [
        { activo: true, antelacionesMin: [60, 120, 180, 240] },
        'antelacionesMin',
      ],
      [
        { activo: true, antelacionesMin: [120], correoRespuesta: 'x' },
        'correoRespuesta',
      ],
      [
        {
          activo: true,
          antelacionesMin: [120],
          telefonoContacto: '9'.repeat(31),
        },
        'telefonoContacto',
      ],
    ])('PUT %p → 400 que nombra %s', async (cuerpo, campo) => {
      // Act
      const res = await request(server())
        .put('/api/recordatorios/configuracion')
        .set('Authorization', `Bearer ${tokenA}`)
        .send(cuerpo)
        .expect(400);

      // Assert
      expect(JSON.stringify((res.body as ErrorBody).message)).toContain(campo);
    });
  });

  describe('GET /api/citas/:citaId/recordatorios', () => {
    let citaA: string;
    let citaB: string;

    beforeAll(() => {
      citaA = lector.sembrarCita(
        citaLeida({ tenantId: TENANT_A, usuarioId: USUARIO_A, inicio: INICIO }),
      ).id;
      citaB = lector.sembrarCita(
        citaLeida({
          tenantId: TENANT_B,
          usuarioId: randomUUID(),
          inicio: INICIO,
        }),
      ).id;
      recordatorios.sembrar({
        tenantId: TENANT_A,
        citaId: citaA,
        antelacionMin: 1440,
        inicioCita: INICIO,
        programadoPara: new Date('2026-10-13T13:30:00Z'),
        estado: EstadoRecordatorio.ENVIADO,
        enviadoEn: new Date('2026-10-13T13:30:04Z'),
        proveedor: 'resend',
        proveedorMensajeId: 're_secreto',
        intentos: 1,
      });
      recordatorios.sembrar({
        tenantId: TENANT_A,
        citaId: citaA,
        antelacionMin: 120,
        inicioCita: INICIO,
        programadoPara: new Date('2026-10-14T11:30:00Z'),
        estado: EstadoRecordatorio.OMITIDO,
        motivo: MotivoRecordatorio.SIN_CORREO,
      });
    });

    it('200 con estado, motivo y fechas; SIN destinatario ni id del proveedor', async () => {
      // Act
      const res = await request(server())
        .get(`/api/citas/${citaA}/recordatorios`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      // Assert
      const cuerpo = res.body as Record<string, unknown>[];
      expect(cuerpo).toEqual([
        {
          id: expect.any(String) as unknown,
          canal: 'email',
          antelacionMin: 1440,
          estado: 'enviado',
          motivo: null,
          programadoPara: '2026-10-13T13:30:00.000Z',
          proximoIntentoEn: null,
          enviadoEn: '2026-10-13T13:30:04.000Z',
          entregadoEn: null,
        },
        {
          id: expect.any(String) as unknown,
          canal: 'email',
          antelacionMin: 120,
          estado: 'omitido',
          motivo: 'sin_correo',
          programadoPara: '2026-10-14T11:30:00.000Z',
          proximoIntentoEn: null,
          enviadoEn: null,
          entregadoEn: null,
        },
      ]);
      expect(JSON.stringify(cuerpo)).not.toContain('re_secreto');
    });

    it('cita de otro tenant → 404', async () => {
      await request(server())
        .get(`/api/citas/${citaB}/recordatorios`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(404);
    });

    it('cita inexistente → 404; id que no es UUID → 400; sin token → 401', async () => {
      await request(server())
        .get(`/api/citas/${randomUUID()}/recordatorios`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(404);
      await request(server())
        .get('/api/citas/no-es-uuid/recordatorios')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(400);
      await request(server())
        .get(`/api/citas/${citaA}/recordatorios`)
        .expect(401);
    });
  });

  describe('POST /api/webhooks/resend (público, firma Svix sobre el cuerpo crudo)', () => {
    let recordatorioId: string;

    beforeAll(() => {
      recordatorioId = recordatorios.sembrar({
        tenantId: TENANT_A,
        citaId: randomUUID(),
        antelacionMin: 120,
        inicioCita: INICIO,
        programadoPara: new Date('2026-10-14T11:30:00Z'),
        estado: EstadoRecordatorio.ENVIADO,
        enviadoEn: new Date('2026-10-14T11:30:02Z'),
        proveedorMensajeId: 're_abc',
      }).id;
    });

    const cuerpo = (type: string, id = recordatorioId): string =>
      // Con espacios y orden propio: la firma es sobre ESTOS bytes, no sobre
      // el JSON re-serializado.
      `{ "type": "${type}",  "created_at": "2026-10-14T11:30:09.000Z", "data": { "email_id": "re_abc", "to": ["paciente@correo.cl"], "tags": { "recordatorio_id": "${id}" } } }`;

    const firmado = (texto: string, cuando = new Date()) => {
      const id = `msg_${randomBytes(6).toString('hex')}`;
      return {
        'svix-id': id,
        'svix-timestamp': String(Math.floor(cuando.getTime() / 1000)),
        'svix-signature': new Webhook(SECRETO_WEBHOOK).sign(id, cuando, texto),
      };
    };

    const post = (texto: string, cabeceras: Record<string, string>) =>
      request(server())
        .post('/api/webhooks/resend')
        .set('Content-Type', 'application/json')
        .set(cabeceras)
        .send(texto);

    it('firma válida → 200 { recibido: true } y estado entregado', async () => {
      // Arrange
      const texto = cuerpo('email.delivered');

      // Act
      const res = await post(texto, firmado(texto)).expect(200);

      // Assert
      expect(res.body).toEqual({ recibido: true });
      expect(recordatorios.buscar(recordatorioId)).toMatchObject({
        estado: EstadoRecordatorio.ENTREGADO,
        entregadoEn: new Date('2026-10-14T11:30:09.000Z'),
      });
    });

    it('evento repetido → 200 sin cambios', async () => {
      // Arrange
      const antes = recordatorios.buscar(recordatorioId);
      const texto = cuerpo('email.delivered');

      // Act & Assert
      await post(texto, firmado(texto)).expect(200);
      expect(recordatorios.buscar(recordatorioId)).toEqual(antes);
    });

    it('firma inválida, vieja o ausente → 400 uniforme', async () => {
      // Arrange
      const texto = cuerpo('email.complained');
      const otro = new Webhook(`whsec_${randomBytes(24).toString('base64')}`);
      const ahora = new Date();
      const malFirmado = {
        ...firmado(texto),
        'svix-signature': otro.sign('msg_x', ahora, texto),
      };

      // Act
      const respuestas = [
        await post(texto, malFirmado),
        await post(texto, firmado(texto, new Date(Date.now() - 6 * 60_000))),
        await post(texto, {}),
      ];

      // Assert
      for (const res of respuestas) {
        expect(res.status).toBe(400);
        expect((res.body as ErrorBody).message).toBe(
          'Firma de webhook inválida',
        );
      }
      expect(recordatorios.buscar(recordatorioId)?.quejaEn).toBeNull();
      expect(supresiones.supresiones.size).toBe(0);
    });

    it('id desconocido → 200', async () => {
      const texto = cuerpo('email.delivered', randomUUID());
      await post(texto, firmado(texto)).expect(200);
    });

    it('no exige JWT', async () => {
      const texto = cuerpo('email.delivery_delayed');
      await post(texto, firmado(texto)).expect(200);
    });
  });
});
