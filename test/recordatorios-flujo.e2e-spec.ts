// PRIMERO: entorno de test (NODE_ENV=test, PLANIFICADOR_ACTIVO=false y la
// base de test en DB_*), antes de que se arme el ConfigModule.
import './support/entorno-app-e2e';

import { randomBytes } from 'node:crypto';

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { Webhook } from 'svix';
import { DataSource } from 'typeorm';

import { AuthModule } from '../src/modules/auth/auth.module';
import { CitaModule } from '../src/modules/cita/cita.module';
import { PacienteModule } from '../src/modules/paciente/paciente.module';
import { PlanificadorRecordatorios } from '../src/modules/recordatorio/infrastructure/planificacion/planificador-recordatorios';
import { RecordatorioPlanificacionModule } from '../src/modules/recordatorio/recordatorio-planificacion.module';
import { RecordatorioModule } from '../src/modules/recordatorio/recordatorio.module';
import { TenantModule } from '../src/modules/tenant/tenant.module';
import { UsuariosModule } from '../src/modules/usuario/usuarios.module';
import { validarEntorno } from '../src/shared/infrastructure/config/entorno';
import { PlanificadorSalida } from '../src/shared/infrastructure/planificacion/planificador-salida';
import { ObservabilidadModule } from '../src/shared/observabilidad.module';
import { PlanificacionModule } from '../src/shared/planificacion.module';

/**
 * Flujo de recordatorios de punta a punta (DoD de US-03, "Flujo"), con el
 * adaptador `registro` y los jobs invocados A MANO (PLANIFICADOR_ACTIVO=false):
 *
 *   POST /citas → outbox → SuscriptorRecordatorios → `programado`
 *   reagendar → anteriores `cancelado` (reprogramado) + nuevos `programado`
 *   cancelar  → `cancelado` (cita_terminal)
 *   cita tardía → un recordatorio inmediato → job de envío → `enviado`
 *   webhook firmado `delivered` → `entregado`
 *   PUT configuración → reprograma; apagarla → `cancelado` (desactivado)
 *   otro tenant → 404; la respuesta no trae destinatario ni id del proveedor
 *
 * ⚠️ REQUIERE PostgreSQL real (vars TEST_DB_*). Arma la app como `AppModule`
 * pero con `synchronize` + `dropSchema` sobre la base de test (las entidades
 * ORM declaran los mismos índices parciales y CHECK que las migraciones).
 */

// Mensajería sin envíos reales y secreto del webhook de prueba.
process.env.MENSAJERIA_ADAPTADOR = 'registro';
const SECRETO_WEBHOOK = `whsec_${randomBytes(24).toString('base64')}`;
process.env.RESEND_WEBHOOK_SECRET = SECRETO_WEBHOOK;

// Horas sin envío LEJOS de ahora (6 a 7 h más tarde, hora de Santiago), para
// que el resultado no dependa de la hora a la que corre el test.
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

interface RegistroBody {
  tenantSlug: string;
  tenantId: string;
}
interface LoginBody {
  accessToken: string;
}
interface CitaBody {
  id: string;
}
interface RecordatorioBody {
  id: string;
  canal: string;
  antelacionMin: number;
  estado: string;
  motivo: string | null;
  programadoPara: string;
  proximoIntentoEn: string | null;
  enviadoEn: string | null;
  entregadoEn: string | null;
}

/** Instante redondeado al minuto (lo que guarda la cita). */
const alMinuto = (ms: number): Date => new Date(Math.ceil(ms / MIN) * MIN);

describe('Recordatorios: flujo completo (e2e con Postgres)', () => {
  let app: INestApplication;
  let tokenA: string;
  let tokenB: string;
  let horaSiguiente = 0;

  const server = (): App => app.getHttpServer() as App;

  const despacharOutbox = async (): Promise<void> => {
    await app.get(PlanificadorSalida).ejecutarDespacho();
  };

  const registrar = async (n: string): Promise<string> => {
    const cred = {
      nombreTenant: `Clinica Recordatorios ${n}`,
      email: `admin@recordatorios-${n}.com`,
      password: 'password1234',
      nombreCompleto: `Dra. ${n}`,
    };
    const reg = await request(server())
      .post('/api/usuarios')
      .send(cred)
      .expect(201);
    const { tenantSlug } = reg.body as RegistroBody;
    const login = await request(server())
      .post('/api/auth/login')
      .send({ tenantSlug, email: cred.email, password: cred.password })
      .expect(200);
    return (login.body as LoginBody).accessToken;
  };

  const crearCita = async (token: string, inicio: Date): Promise<string> => {
    const res = await request(server())
      .post('/api/citas')
      .set('Authorization', `Bearer ${token}`)
      .send({
        inicio: inicio.toISOString(),
        duracionMin: 45,
        tipoConsulta: 'Control',
        paciente: {
          nombre: `Paciente ${horaSiguiente++}`,
          telefono: '+56 9 1111 1111',
          correo: `paciente${horaSiguiente}@correo.cl`,
          consentimiento: true,
        },
      })
      .expect(201);
    return (res.body as CitaBody).id;
  };

  const recordatoriosDe = async (
    citaId: string,
    token = tokenA,
  ): Promise<RecordatorioBody[]> => {
    const res = await request(server())
      .get(`/api/citas/${citaId}/recordatorios`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    return res.body as RecordatorioBody[];
  };

  const programados = (lista: RecordatorioBody[]): RecordatorioBody[] =>
    lista.filter((r) => r.estado === 'programado');

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, validate: validarEntorno }),
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
        ObservabilidadModule,
        AuthModule,
        TenantModule,
        UsuariosModule,
        PacienteModule,
        CitaModule,
        RecordatorioModule,
        PlanificacionModule,
        RecordatorioPlanificacionModule,
      ],
    }).compile();

    // Igual que src/main.ts.
    app = moduleFixture.createNestApplication({ rawBody: true });
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();

    tokenA = await registrar('a');
    tokenB = await registrar('b');
  });

  afterAll(async () => {
    await app?.close();
  });

  it('se conecta a la base de test', () => {
    expect(app.get(DataSource).options.database).toBe(
      process.env.TEST_DB_NAME ?? 'citia_test',
    );
  });

  describe('programar, reagendar y cancelar', () => {
    let citaId: string;
    const inicio = alMinuto(ARRANQUE.getTime() + 3 * 24 * HORA + 12 * HORA);
    const nuevoInicio = new Date(inicio.getTime() + HORA);

    it('POST /citas → tras el outbox, programados a las 24 h y 2 h', async () => {
      // Act
      citaId = await crearCita(tokenA, inicio);
      const antes = await recordatoriosDe(citaId);
      await despacharOutbox();
      const despues = await recordatoriosDe(citaId);

      // Assert
      expect(antes).toEqual([]);
      expect(
        despues.map((r) => [r.antelacionMin, r.estado, r.programadoPara]),
      ).toEqual([
        [
          1440,
          'programado',
          new Date(inicio.getTime() - 24 * HORA).toISOString(),
        ],
        [
          120,
          'programado',
          new Date(inicio.getTime() - 2 * HORA).toISOString(),
        ],
      ]);
      expect(
        despues.every((r) => r.proximoIntentoEn === r.programadoPara),
      ).toBe(true);
    });

    it('repetir el despacho y el respaldo no duplica nada', async () => {
      // Act
      await despacharOutbox();
      await app.get(PlanificadorRecordatorios).ejecutarRespaldo();

      // Assert
      expect(await recordatoriosDe(citaId)).toHaveLength(2);
    });

    it('la respuesta no trae destinatario ni id ni nombre del proveedor', async () => {
      // Act
      const [r] = await recordatoriosDe(citaId);

      // Assert
      expect(Object.keys(r).sort()).toEqual(
        [
          'antelacionMin',
          'canal',
          'enviadoEn',
          'entregadoEn',
          'estado',
          'id',
          'motivo',
          'programadoPara',
          'proximoIntentoEn',
        ].sort(),
      );
    });

    it('reagendar → los anteriores cancelado (reprogramado) y los nuevos programado', async () => {
      // Act
      await request(server())
        .patch(`/api/citas/${citaId}/reagendar`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ inicio: nuevoInicio.toISOString() })
        .expect(200);
      await despacharOutbox();
      const lista = await recordatoriosDe(citaId);

      // Assert
      const cancelados = lista.filter((r) => r.estado === 'cancelado');
      expect(cancelados).toHaveLength(2);
      expect(cancelados.every((r) => r.motivo === 'reprogramado')).toBe(true);
      expect(
        programados(lista)
          .map((r) => r.programadoPara)
          .sort(),
      ).toEqual(
        [
          new Date(nuevoInicio.getTime() - 24 * HORA).toISOString(),
          new Date(nuevoInicio.getTime() - 2 * HORA).toISOString(),
        ].sort(),
      );
    });

    it('cancelar → los programado pasan a cancelado (cita_terminal)', async () => {
      // Act
      await request(server())
        .patch(`/api/citas/${citaId}/cancelar`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({})
        .expect(200);
      await despacharOutbox();
      const lista = await recordatoriosDe(citaId);

      // Assert
      expect(programados(lista)).toEqual([]);
      expect(
        lista.filter((r) => r.motivo === 'cita_terminal').map((r) => r.estado),
      ).toEqual(['cancelado', 'cancelado']);
    });

    it('otro tenant → 404', async () => {
      await request(server())
        .get(`/api/citas/${citaId}/recordatorios`)
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(404);
    });
  });

  describe('envío y webhook', () => {
    let citaId: string;
    let recordatorioId: string;

    it('cita creada tarde → un recordatorio inmediato (2 h) y el de 24 h omitido', async () => {
      // Act — faltan 90 min: el de 24 h y el de 2 h ya pasaron
      citaId = await crearCita(tokenA, alMinuto(Date.now() + 90 * MIN));
      await despacharOutbox();
      const lista = await recordatoriosDe(citaId);

      // Assert
      expect(
        lista.map((r) => [r.antelacionMin, r.estado, r.motivo]).sort(),
      ).toEqual(
        [
          [120, 'programado', null],
          [1440, 'omitido', 'creada_tarde'],
        ].sort(),
      );
      const tardio = programados(lista)[0];
      recordatorioId = tardio.id;
      expect(
        new Date(tardio.proximoIntentoEn as string).getTime(),
      ).toBeLessThanOrEqual(Date.now());
    });

    it('el job de envío (a mano) lo deja enviado con el adaptador registro', async () => {
      // Act
      await app.get(PlanificadorRecordatorios).ejecutarEnvio();
      const enviado = (await recordatoriosDe(citaId)).find(
        (r) => r.id === recordatorioId,
      );

      // Assert
      expect(enviado).toMatchObject({
        estado: 'enviado',
        motivo: null,
        proximoIntentoEn: null,
        entregadoEn: null,
      });
      expect(enviado?.enviadoEn).not.toBeNull();
    });

    it('un segundo tick no lo reenvía', async () => {
      // Arrange
      const antes = await recordatoriosDe(citaId);

      // Act
      await app.get(PlanificadorRecordatorios).ejecutarEnvio();

      // Assert
      expect(await recordatoriosDe(citaId)).toEqual(antes);
    });

    it('webhook firmado (delivered) → 200 y entregado; firma inválida → 400 sin cambios', async () => {
      // Arrange
      const cuerpo = JSON.stringify({
        type: 'email.delivered',
        created_at: new Date().toISOString(),
        data: {
          email_id: `registro_recordatorio_${recordatorioId}`,
          to: ['paciente@correo.cl'],
          tags: { recordatorio_id: recordatorioId },
        },
      });
      const id = `msg_${randomBytes(6).toString('hex')}`;
      const ahora = new Date();
      const cabeceras = {
        'svix-id': id,
        'svix-timestamp': String(Math.floor(ahora.getTime() / 1000)),
        'svix-signature': new Webhook(SECRETO_WEBHOOK).sign(id, ahora, cuerpo),
      };

      // Act — primero con la firma alterada, luego bien
      await request(server())
        .post('/api/webhooks/resend')
        .set('Content-Type', 'application/json')
        .set({ ...cabeceras, 'svix-signature': 'v1,AAAA' })
        .send(cuerpo)
        .expect(400);
      const intermedio = (await recordatoriosDe(citaId)).find(
        (r) => r.id === recordatorioId,
      );
      await request(server())
        .post('/api/webhooks/resend')
        .set('Content-Type', 'application/json')
        .set(cabeceras)
        .send(cuerpo)
        .expect(200);
      const final = (await recordatoriosDe(citaId)).find(
        (r) => r.id === recordatorioId,
      );

      // Assert
      expect(intermedio?.estado).toBe('enviado');
      expect(final?.estado).toBe('entregado');
      expect(final?.entregadoEn).not.toBeNull();
    });
  });

  describe('configuración del profesional', () => {
    let citaId: string;
    const inicio = alMinuto(ARRANQUE.getTime() + 5 * 24 * HORA + 12 * HORA);

    it('GET → la predeterminada', async () => {
      const res = await request(server())
        .get('/api/recordatorios/configuracion')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);
      expect(res.body).toMatchObject({
        activo: true,
        antelacionesMin: [1440, 120],
        predeterminada: true,
      });
    });

    it('PUT con otros momentos → reprograma las citas futuras del profesional', async () => {
      // Arrange
      citaId = await crearCita(tokenA, inicio);
      await despacharOutbox();

      // Act
      await request(server())
        .put('/api/recordatorios/configuracion')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ activo: true, antelacionesMin: [2880] })
        .expect(200);
      await despacharOutbox();
      const lista = await recordatoriosDe(citaId);

      // Assert
      expect(programados(lista).map((r) => r.antelacionMin)).toEqual([2880]);
      expect(
        lista
          .filter((r) => r.estado === 'cancelado')
          .map((r) => [r.antelacionMin, r.motivo])
          .sort(),
      ).toEqual(
        [
          [120, 'reprogramado'],
          [1440, 'reprogramado'],
        ].sort(),
      );
    });

    it('apagarla → los programado pasan a cancelado (desactivado)', async () => {
      // Act
      await request(server())
        .put('/api/recordatorios/configuracion')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ activo: false, antelacionesMin: [2880] })
        .expect(200);
      await despacharOutbox();
      const lista = await recordatoriosDe(citaId);

      // Assert
      expect(programados(lista)).toEqual([]);
      expect(lista.find((r) => r.antelacionMin === 2880)).toMatchObject({
        estado: 'cancelado',
        motivo: 'desactivado',
      });
    });

    it('la de otro profesional no cambia', async () => {
      const res = await request(server())
        .get('/api/recordatorios/configuracion')
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(200);
      expect(res.body).toMatchObject({ predeterminada: true, activo: true });
    });
  });
});
