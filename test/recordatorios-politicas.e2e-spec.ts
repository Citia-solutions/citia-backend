// PRIMERO: entorno de test (NODE_ENV=test, PLANIFICADOR_ACTIVO=false y la
// base de test en DB_*), antes de que se arme el ConfigModule.
import './support/entorno-app-e2e';

import { randomBytes } from 'node:crypto';

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { Webhook } from 'svix';
import { DataSource } from 'typeorm';

import { AuthModule } from '../src/modules/auth/auth.module';
import { CitaModule } from '../src/modules/cita/cita.module';
import { PacienteModule } from '../src/modules/paciente/paciente.module';
import {
  AlertaRecordatorios,
  BitacoraRecordatorios,
} from '../src/modules/recordatorio/application/bitacora-recordatorios';
import { EnviarRecordatoriosService } from '../src/modules/recordatorio/application/enviar-recordatorios.service';
import { ReconciliacionRespaldoService } from '../src/modules/recordatorio/application/reconciliacion-respaldo.service';
import { ReconciliarRecordatoriosService } from '../src/modules/recordatorio/application/reconciliar-recordatorios.service';
import { SuscriptorRecordatorios } from '../src/modules/recordatorio/application/suscriptor-recordatorios';
import { CanalMensajeria } from '../src/modules/recordatorio/domain/canal-mensajeria';
import { ConfiguracionRecordatorioRepository } from '../src/modules/recordatorio/domain/configuracion-recordatorio.repository';
import { calcularHashCorreo } from '../src/modules/recordatorio/domain/hash-correo';
import { LectorCitas } from '../src/modules/recordatorio/domain/lector-citas';
import { RecordatorioRepository } from '../src/modules/recordatorio/domain/recordatorio.repository';
import { SupresionCorreoRepository } from '../src/modules/recordatorio/domain/supresion-correo.repository';
import {
  leerOpcionesEnvio,
  leerOpcionesRecordatorios,
} from '../src/modules/recordatorio/infrastructure/config/opciones-recordatorios';
import { PlanificadorRecordatorios } from '../src/modules/recordatorio/infrastructure/planificacion/planificador-recordatorios';
import { RecordatorioPlanificacionModule } from '../src/modules/recordatorio/recordatorio-planificacion.module';
import { RecordatorioModule } from '../src/modules/recordatorio/recordatorio.module';
import { SolicitudModule } from '../src/modules/solicitud/solicitud.module';
import { TenantModule } from '../src/modules/tenant/tenant.module';
import { UsuariosModule } from '../src/modules/usuario/usuarios.module';
import { TransactionRunner } from '../src/shared/application/transaction-runner';
import {
  Entorno,
  validarEntorno,
} from '../src/shared/infrastructure/config/entorno';
import { PlanificadorSalida } from '../src/shared/infrastructure/planificacion/planificador-salida';
import { ObservabilidadModule } from '../src/shared/observabilidad.module';
import { PlanificacionModule } from '../src/shared/planificacion.module';
import {
  BitacoraEnMemoria,
  CanalMensajeriaFalso,
} from './support/mensajeria-falsa';

/**
 * Flujo de recordatorios (DoD de US-03, "Flujo" y "cuota") que
 * `recordatorios-flujo.e2e-spec.ts` no cubre, con Postgres, el outbox real y
 * los jobs invocados A MANO (PLANIFICADOR_ACTIVO=false):
 *
 *   aceptar una solicitud de la bandeja → `programado`
 *   asistencia / inasistencia → `cancelado` (cita_terminal)
 *   cita cancelada o reagendada entre la programación y el envío → `cancelado`
 *     al revalidar, SIN llamar al proveedor
 *   paciente viejo sin correo (fila con NULL) → `omitido` (sin_correo)
 *   rebote por webhook → supresión → `omitido` (correo_suprimido)
 *   tope del tenant → `omitido` (limite_tenant)
 *   cuota local agotada → `fallido` (cuota_agotada), sin llamar al proveedor,
 *     con una sola alerta por periodo
 *   el mismo hecho N veces (en serie y a la vez) → sin duplicados
 *   la configuración solo toca las citas futuras de SU profesional
 *
 * RELOJ: la reconciliación, el envío y el respaldo usan un reloj VIRTUAL =
 * ahora + un desfase fijo que lo deja a las `E2E_RELOJ_HORA_UTC` (15 por
 * defecto: 11:00–12:00 en Santiago), lejos de las horas sin envío
 * (21:00–08:00), de la medianoche de la clínica y de la medianoche UTC (el
 * reinicio de la cuota). Así el resultado no depende de la hora real a la
 * que corra el test. El despachador del outbox y el webhook usan el reloj
 * real (no deciden nada por la hora).
 *
 * El canal es un `CanalMensajeriaFalso` (cuenta cada llamada) y la bitácora,
 * una `BitacoraEnMemoria` (para las alertas de cuota).
 *
 * ⚠️ REQUIERE PostgreSQL real (vars TEST_DB_*), con synchronize + dropSchema.
 */

process.env.MENSAJERIA_ADAPTADOR = 'registro';
const SECRETO_WEBHOOK = `whsec_${randomBytes(24).toString('base64')}`;
process.env.RESEND_WEBHOOK_SECRET = SECRETO_WEBHOOK;
process.env.APP_TZ = 'America/Santiago';
// Los valores de producción, salvo que se quiera probar otra ventana.
process.env.RECORDATORIO_SILENCIO_DESDE ??= '21:00';
process.env.RECORDATORIO_SILENCIO_HASTA ??= '08:00';
// Topes bajos para alcanzarlos en el test (ADR-13 §11).
const MAX_POR_TENANT = 2;
const CUOTA_DIARIA = 30;
process.env.RECORDATORIO_MAX_DIARIO_POR_TENANT = String(MAX_POR_TENANT);
process.env.RESEND_CUOTA_DIARIA = String(CUOTA_DIARIA);
process.env.RESEND_CUOTA_MENSUAL = '3000';

const MIN = 60_000;
const HORA = 60 * MIN;
const DIA = 24 * HORA;

const HORA_ANCLA_UTC = Number(process.env.E2E_RELOJ_HORA_UTC ?? '15');
if (
  !Number.isInteger(HORA_ANCLA_UTC) ||
  HORA_ANCLA_UTC < 0 ||
  HORA_ANCLA_UTC > 23
) {
  throw new Error('E2E_RELOJ_HORA_UTC debe ser un entero entre 0 y 23');
}

/** Desfase que lleva "ahora" a la próxima `HORA_ANCLA_UTC`:00 (al menos 10 min adelante). */
const DESFASE_MS = ((): number => {
  const real = Date.now();
  const ancla = new Date(real);
  ancla.setUTCHours(HORA_ANCLA_UTC, 0, 0, 0);
  while (ancla.getTime() < real + 10 * MIN) {
    ancla.setTime(ancla.getTime() + DIA);
  }
  return ancla.getTime() - real;
})();

/** Reloj virtual de los casos de uso de recordatorio. */
const reloj = (): Date => new Date(Date.now() + DESFASE_MS);

/** Instante redondeado al minuto siguiente (lo que guarda la cita). */
const alMinuto = (ms: number): Date => new Date(Math.ceil(ms / MIN) * MIN);

interface Cuenta {
  token: string;
  tenantId: string;
  slug: string;
}
interface RegistroBody {
  tenantSlug: string;
  tenantId: string;
}
interface LoginBody {
  accessToken: string;
}
interface CitaBody {
  id: string;
  pacienteId: string;
}
interface RecordatorioBody {
  id: string;
  antelacionMin: number;
  estado: string;
  motivo: string | null;
  programadoPara: string;
}
interface SolicitudBody {
  id: string;
  rut: string;
}

describe('Recordatorios: políticas de envío y flujo (e2e con Postgres)', () => {
  let app: INestApplication;
  let base: DataSource;
  const canal = new CanalMensajeriaFalso();
  const bitacora = new BitacoraEnMemoria();
  let pacienteN = 0;

  // Una organización por escenario que ENVÍA: el tope por tenant es 2.
  let general: Cuenta; // sin envíos
  let supresion: Cuenta; // 1 envío
  let limite: Cuenta; // 2 envíos + 1 omitido
  let cuota: Cuenta; // 0 envíos (la cuota es global)
  let configuracion: Cuenta; // sin envíos
  let ajena: Cuenta; // la "otra organización" y el relleno de la cuota

  const server = (): App => app.getHttpServer() as App;

  const despacharOutbox = async (): Promise<void> => {
    await app.get(PlanificadorSalida).ejecutarDespacho();
  };
  const ejecutarEnvio = async (): Promise<void> => {
    await app.get(PlanificadorRecordatorios).ejecutarEnvio();
  };

  /** Llamadas al proveedor para ese recordatorio. */
  const llamadasA = (recordatorioId: string): number =>
    canal.enviados.filter((m) => m.etiquetas.recordatorio_id === recordatorioId)
      .length;

  const registrar = async (n: string): Promise<Cuenta> => {
    const cred = {
      nombreTenant: `Clinica Politicas ${n}`,
      email: `admin@politicas-${n}.com`,
      password: 'password1234',
      nombreCompleto: `Dra. ${n}`,
    };
    const reg = await request(server())
      .post('/api/usuarios')
      .send(cred)
      .expect(201);
    const { tenantSlug, tenantId } = reg.body as RegistroBody;
    const login = await request(server())
      .post('/api/auth/login')
      .send({ tenantSlug, email: cred.email, password: cred.password })
      .expect(200);
    return {
      token: (login.body as LoginBody).accessToken,
      tenantId,
      slug: tenantSlug,
    };
  };

  const crearCita = async (
    cuenta: Cuenta,
    inicio: Date,
    paciente: { pacienteId: string } | { correo: string } | null = null,
  ): Promise<CitaBody> => {
    pacienteN++;
    const cuerpo =
      paciente && 'pacienteId' in paciente
        ? { pacienteId: paciente.pacienteId }
        : {
            paciente: {
              nombre: `Paciente ${pacienteN}`,
              telefono: '+56 9 1111 1111',
              correo:
                paciente && 'correo' in paciente
                  ? paciente.correo
                  : `paciente${pacienteN}@correo.cl`,
              consentimiento: true,
            },
          };
    const res = await request(server())
      .post('/api/citas')
      .set('Authorization', `Bearer ${cuenta.token}`)
      .send({
        inicio: inicio.toISOString(),
        duracionMin: 45,
        tipoConsulta: 'Control',
        ...cuerpo,
      })
      .expect(201);
    return res.body as CitaBody;
  };

  const recordatoriosDe = async (
    citaId: string,
    cuenta: Cuenta,
  ): Promise<RecordatorioBody[]> => {
    const res = await request(server())
      .get(`/api/citas/${citaId}/recordatorios`)
      .set('Authorization', `Bearer ${cuenta.token}`)
      .expect(200);
    return res.body as RecordatorioBody[];
  };

  const patchCita = (
    cuenta: Cuenta,
    citaId: string,
    accion: string,
    body = {},
  ) =>
    request(server())
      .patch(`/api/citas/${citaId}/${accion}`)
      .set('Authorization', `Bearer ${cuenta.token}`)
      .send(body)
      .expect(200);

  /** Cita que empieza en ~90 min: un recordatorio tardío (2 h) listo para salir. */
  const citaTardia = async (
    cuenta: Cuenta,
    paciente: { pacienteId: string } | { correo: string } | null = null,
  ): Promise<{ cita: CitaBody; tardioId: string }> => {
    const cita = await crearCita(
      cuenta,
      alMinuto(reloj().getTime() + 90 * MIN),
      paciente,
    );
    await despacharOutbox();
    const lista = await recordatoriosDe(cita.id, cuenta);
    const tardio = lista.find((r) => r.estado === 'programado');
    expect(
      lista.map((r) => [r.antelacionMin, r.estado, r.motivo]).sort(),
    ).toEqual(
      [
        [120, 'programado', null],
        [1440, 'omitido', 'creada_tarde'],
      ].sort(),
    );
    return { cita, tardioId: tardio?.id ?? '' };
  };

  const estadoDe = async (
    citaId: string,
    recordatorioId: string,
    cuenta: Cuenta,
  ): Promise<RecordatorioBody | undefined> =>
    (await recordatoriosDe(citaId, cuenta)).find(
      (r) => r.id === recordatorioId,
    );

  const firmar = (cuerpo: string) => {
    const id = `msg_${randomBytes(6).toString('hex')}`;
    const ahora = new Date();
    return {
      'svix-id': id,
      'svix-timestamp': String(Math.floor(ahora.getTime() / 1000)),
      'svix-signature': new Webhook(SECRETO_WEBHOOK).sign(id, ahora, cuerpo),
    };
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
        SolicitudModule,
        RecordatorioModule,
        PlanificacionModule,
        RecordatorioPlanificacionModule,
      ],
    })
      .overrideProvider(CanalMensajeria)
      .useValue(canal)
      .overrideProvider(BitacoraRecordatorios)
      .useValue(bitacora)
      // Mismas fábricas que RecordatorioModule, con el reloj virtual.
      .overrideProvider(ReconciliarRecordatoriosService)
      .useFactory({
        factory: (
          recordatorios: RecordatorioRepository,
          configuraciones: ConfiguracionRecordatorioRepository,
          lector: LectorCitas,
          config: ConfigService<Entorno, true>,
        ) =>
          new ReconciliarRecordatoriosService(
            recordatorios,
            configuraciones,
            lector,
            leerOpcionesRecordatorios(config),
            reloj,
          ),
        inject: [
          RecordatorioRepository,
          ConfiguracionRecordatorioRepository,
          LectorCitas,
          ConfigService,
        ],
      })
      .overrideProvider(ReconciliacionRespaldoService)
      .useFactory({
        factory: (
          transacciones: TransactionRunner,
          lector: LectorCitas,
          reconciliacion: ReconciliarRecordatoriosService,
          config: ConfigService<Entorno, true>,
        ) =>
          new ReconciliacionRespaldoService(
            transacciones,
            lector,
            reconciliacion,
            {
              margenMinimoMin:
                leerOpcionesRecordatorios(config).parametros.margenMinimoMin,
            },
            reloj,
          ),
        inject: [
          TransactionRunner,
          LectorCitas,
          ReconciliarRecordatoriosService,
          ConfigService,
        ],
      })
      .overrideProvider(EnviarRecordatoriosService)
      .useFactory({
        factory: (
          transacciones: TransactionRunner,
          recordatorios: RecordatorioRepository,
          configuraciones: ConfiguracionRecordatorioRepository,
          supresiones: SupresionCorreoRepository,
          lector: LectorCitas,
          canalInyectado: CanalMensajeria,
          bitacoraInyectada: BitacoraRecordatorios,
          config: ConfigService<Entorno, true>,
        ) =>
          new EnviarRecordatoriosService(
            {
              transacciones,
              recordatorios,
              configuraciones,
              supresiones,
              lector,
              canal: canalInyectado,
              bitacora: bitacoraInyectada,
            },
            // Sin la pausa de 500 ms entre envíos (ritmo del proveedor).
            { ...leerOpcionesEnvio(config), pausaEntreEnviosMs: 0 },
            reloj,
          ),
        inject: [
          TransactionRunner,
          RecordatorioRepository,
          ConfiguracionRecordatorioRepository,
          SupresionCorreoRepository,
          LectorCitas,
          CanalMensajeria,
          BitacoraRecordatorios,
          ConfigService,
        ],
      })
      .compile();

    // Igual que src/main.ts.
    app = moduleFixture.createNestApplication({ rawBody: true });
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
    base = app.get(DataSource);

    general = await registrar('general');
    supresion = await registrar('supresion');
    limite = await registrar('limite');
    cuota = await registrar('cuota');
    configuracion = await registrar('configuracion');
    ajena = await registrar('ajena');
  }, 30_000);

  afterAll(async () => {
    await app?.close();
  });

  it('el reloj virtual queda a la hora ancla, fuera de las horas sin envío', () => {
    const ahora = reloj();
    expect(ahora.getUTCHours()).toBe(HORA_ANCLA_UTC);
    expect(DESFASE_MS).toBeGreaterThanOrEqual(10 * MIN);
    expect(app.get(DataSource).options.database).toBe(
      process.env.TEST_DB_NAME ?? 'citia_test',
    );
  });

  describe('programar y anular por hechos de la cita', () => {
    it('aceptar una solicitud de la bandeja → programados a las 24 h y 2 h (vía su CitaCreada)', async () => {
      // Arrange — el paciente llena el formulario público
      await request(server())
        .post(`/api/publico/${general.slug}/solicitudes`)
        .send({
          rut: '12.345.678-5',
          nombrePaciente: 'Paciente Solicitud',
          telefono: '+56 9 3333 3333',
          correo: 'solicitud@correo.cl',
          motivo: 'Control anual',
          preferenciaHoraria: 'mañanas',
          consentimiento: true,
        })
        .expect(202);
      const bandeja = await request(server())
        .get('/api/solicitudes')
        .set('Authorization', `Bearer ${general.token}`)
        .expect(200);
      const [solicitud] = bandeja.body as SolicitudBody[];
      const inicio = alMinuto(reloj().getTime() + 3 * DIA + 3 * HORA);

      // Act
      const aceptada = await request(server())
        .post(`/api/solicitudes/${solicitud.id}/aceptar`)
        .set('Authorization', `Bearer ${general.token}`)
        .send({
          inicio: inicio.toISOString(),
          duracionMin: 45,
          tipoConsulta: 'Control anual',
        })
        .expect(201);
      const citaId = (aceptada.body as { cita: CitaBody }).cita.id;
      const antes = await recordatoriosDe(citaId, general);
      await despacharOutbox();
      const despues = await recordatoriosDe(citaId, general);

      // Assert
      expect(antes).toEqual([]);
      expect(
        despues.map((r) => [r.antelacionMin, r.estado, r.programadoPara]),
      ).toEqual([
        [1440, 'programado', new Date(inicio.getTime() - DIA).toISOString()],
        [
          120,
          'programado',
          new Date(inicio.getTime() - 2 * HORA).toISOString(),
        ],
      ]);
    });

    it.each(['asistencia', 'inasistencia'])(
      'confirmar no cambia nada; %s → los programado pasan a cancelado (cita_terminal)',
      async (accion) => {
        // Arrange
        const cita = await crearCita(
          general,
          alMinuto(reloj().getTime() + 3 * DIA + 4 * HORA),
        );
        await despacharOutbox();
        const iniciales = await recordatoriosDe(cita.id, general);
        expect(programados(iniciales)).toHaveLength(2);

        // Act — confirmar (CitaConfirmada): misma hora, nada cambia
        await patchCita(general, cita.id, 'confirmar');
        await despacharOutbox();
        const confirmada = await recordatoriosDe(cita.id, general);
        await patchCita(general, cita.id, accion);
        await despacharOutbox();
        const cerrada = await recordatoriosDe(cita.id, general);

        // Assert
        expect(confirmada).toEqual(iniciales);
        expect(cerrada.map((r) => r.id)).toEqual(iniciales.map((r) => r.id));
        expect(cerrada.map((r) => [r.estado, r.motivo])).toEqual([
          ['cancelado', 'cita_terminal'],
          ['cancelado', 'cita_terminal'],
        ]);
      },
    );
  });

  describe('revalidación justo antes de enviar (ADR-13 §7, política 1)', () => {
    it.each([
      ['cancelada', 'cancelar', {}, 'cita_terminal'],
      [
        'reagendada',
        'reagendar',
        { inicio: alMinuto(Date.now() + DESFASE_MS + 5 * DIA).toISOString() },
        'reprogramado',
      ],
    ])(
      'cita %s entre la programación y el envío (sin que el outbox llegue antes) → cancelado al revalidar, SIN llamar al proveedor',
      async (_caso, accion, cuerpo, motivo) => {
        // Arrange — el recordatorio quedó programado y vencido
        const { cita, tardioId } = await citaTardia(general);
        // La cita cambia, pero el hecho todavía no se despacha
        await patchCita(general, cita.id, accion, cuerpo);

        // Act
        await ejecutarEnvio();

        // Assert
        expect(llamadasA(tardioId)).toBe(0);
        expect(await estadoDe(cita.id, tardioId, general)).toMatchObject({
          estado: 'cancelado',
          motivo,
        });

        // El hecho que llega después no duplica ni revive nada
        await despacharOutbox();
        const lista = await recordatoriosDe(cita.id, general);
        expect(lista.filter((r) => r.id === tardioId)).toHaveLength(1);
        expect(lista.find((r) => r.id === tardioId)?.estado).toBe('cancelado');
      },
    );
  });

  describe('políticas de omisión', () => {
    it('paciente viejo sin correo (fila con NULL) → omitido (sin_correo), sin llamar al proveedor', async () => {
      // Arrange — un paciente de antes de la Fase 2: correo NULL en la base
      const [{ id: pacienteId }] = await base.query<{ id: string }[]>(
        `INSERT INTO pacientes (nombre, telefono, correo, consentimiento, tenant_id, rut)
         VALUES ('Paciente Antiguo', '+56 9 2222 2222', NULL, true, $1, NULL)
         RETURNING id`,
        [general.tenantId],
      );
      // La cita se crea igual (la agenda no se bloquea por un dato de contacto)
      const { cita, tardioId } = await citaTardia(general, { pacienteId });

      // Act
      await ejecutarEnvio();

      // Assert
      expect(cita.pacienteId).toBe(pacienteId);
      expect(llamadasA(tardioId)).toBe(0);
      expect(await estadoDe(cita.id, tardioId, general)).toMatchObject({
        estado: 'omitido',
        motivo: 'sin_correo',
      });
    });

    it('rebote permanente por webhook → fallido (rebote) + supresión por hash → el siguiente omitido (correo_suprimido)', async () => {
      // Arrange — primer recordatorio: sale
      const correo = 'rebota@correo.cl';
      const primero = await citaTardia(supresion, { correo });
      await ejecutarEnvio();
      expect(llamadasA(primero.tardioId)).toBe(1);
      expect(
        await estadoDe(primero.cita.id, primero.tardioId, supresion),
      ).toMatchObject({ estado: 'enviado' });

      // Act 1 — Resend avisa el rebote (con la dirección en otra forma)
      const cuerpo = JSON.stringify({
        type: 'email.bounced',
        created_at: new Date().toISOString(),
        data: {
          email_id: `msg_recordatorio/${primero.tardioId}`,
          to: ['  Rebota@Correo.CL '],
          bounce: { type: 'Permanent', subType: 'General' },
          tags: { recordatorio_id: primero.tardioId },
        },
      });
      await request(server())
        .post('/api/webhooks/resend')
        .set('Content-Type', 'application/json')
        .set(firmar(cuerpo))
        .send(cuerpo)
        .expect(200);

      // Assert 1
      expect(
        await estadoDe(primero.cita.id, primero.tardioId, supresion),
      ).toMatchObject({ estado: 'fallido', motivo: 'rebote' });
      const supresiones = await base.query<
        {
          correo_hash: string;
          motivo: string;
          origen_recordatorio_id: string;
        }[]
      >(
        'SELECT correo_hash, motivo, origen_recordatorio_id FROM supresiones_correo',
      );
      expect(supresiones).toEqual([
        {
          correo_hash: calcularHashCorreo(correo),
          motivo: 'rebote',
          origen_recordatorio_id: primero.tardioId,
        },
      ]);
      expect(JSON.stringify(supresiones)).not.toContain('@');

      // Act 2 — otra cita del MISMO paciente
      const segundo = await citaTardia(supresion, {
        pacienteId: primero.cita.pacienteId,
      });
      await ejecutarEnvio();

      // Assert 2
      expect(llamadasA(segundo.tardioId)).toBe(0);
      expect(
        await estadoDe(segundo.cita.id, segundo.tardioId, supresion),
      ).toMatchObject({ estado: 'omitido', motivo: 'correo_suprimido' });
    });

    it(`tope diario del tenant (${MAX_POR_TENANT}) → el siguiente omitido (limite_tenant), sin llamar al proveedor`, async () => {
      // Arrange — tres recordatorios vencidos de la misma organización
      const tardios: { citaId: string; id: string }[] = [];
      for (let i = 0; i < MAX_POR_TENANT + 1; i++) {
        const { cita, tardioId } = await citaTardia(limite);
        tardios.push({ citaId: cita.id, id: tardioId });
      }

      // Act
      await ejecutarEnvio();

      // Assert
      const estados = await Promise.all(
        tardios.map((t) => estadoDe(t.citaId, t.id, limite)),
      );
      const enviados = estados.filter((r) => r?.estado === 'enviado');
      const omitidos = estados.filter((r) => r?.estado === 'omitido');
      expect(enviados).toHaveLength(MAX_POR_TENANT);
      expect(omitidos).toEqual([
        expect.objectContaining({ motivo: 'limite_tenant' }),
      ]);
      expect(llamadasA(omitidos[0]?.id ?? '')).toBe(0);
      expect(tardios.reduce((total, t) => total + llamadasA(t.id), 0)).toBe(
        MAX_POR_TENANT,
      );
    });
  });

  describe('sin duplicados', () => {
    let citaId: string;

    /** Vuelve a encolar el hecho: la fila original (pendiente otra vez) y `copias` filas nuevas. */
    const reencolar = async (
      nombre: string,
      copias: number,
    ): Promise<number> => {
      const [{ id }] = await base.query<{ id: string }[]>(
        `SELECT id FROM eventos_salida
          WHERE nombre = $1 AND payload->>'citaId' = $2
          ORDER BY creado_en DESC LIMIT 1`,
        [nombre, citaId],
      );
      await base.query(
        `UPDATE eventos_salida
            SET estado = 'pendiente', entregado_en = NULL, proximo_intento_en = now()
          WHERE id = $1`,
        [id],
      );
      await base.query(
        `INSERT INTO eventos_salida (nombre, tenant_id, payload, ocurrido_en)
         SELECT e.nombre, e.tenant_id, e.payload, e.ocurrido_en
           FROM eventos_salida e, generate_series(1, $2::int)
          WHERE e.id = $1`,
        [id, copias],
      );
      const [{ n }] = await base.query<{ n: number }[]>(
        `SELECT count(*)::int AS n FROM eventos_salida
          WHERE estado = 'pendiente' AND nombre = $1 AND payload->>'citaId' = $2`,
        [nombre, citaId],
      );
      return n;
    };

    beforeAll(async () => {
      citaId = (await crearCita(general, alMinuto(reloj().getTime() + 4 * DIA)))
        .id;
      await despacharOutbox();
    });

    it('el mismo CitaCreada entregado 6 veces por el outbox → los mismos 2 programados', async () => {
      // Arrange
      const antes = await recordatoriosDe(citaId, general);
      expect(await reencolar('CitaCreada', 5)).toBe(6);

      // Act
      await despacharOutbox();

      // Assert
      const [{ pendientes }] = await base.query<{ pendientes: number }[]>(
        `SELECT count(*)::int AS pendientes FROM eventos_salida WHERE estado <> 'entregado'`,
      );
      expect(pendientes).toBe(0);
      expect(await recordatoriosDe(citaId, general)).toEqual(antes);
      expect(programados(antes)).toHaveLength(2);
    });

    it('el mismo hecho manejado 5 veces A LA VEZ (5 transacciones) → sin duplicados (candado por cita + clave única)', async () => {
      // Arrange
      const antes = await recordatoriosDe(citaId, general);
      const [fila] = await base.query<
        {
          id: string;
          nombre: string;
          tenant_id: string;
          payload: Record<string, unknown>;
          ocurrido_en: Date;
        }[]
      >(
        `SELECT id, nombre, tenant_id, payload, ocurrido_en FROM eventos_salida
          WHERE nombre = 'CitaCreada' AND payload->>'citaId' = $1 LIMIT 1`,
        [citaId],
      );
      const evento = {
        id: fila.id,
        nombre: fila.nombre,
        tenantId: fila.tenant_id,
        payload: fila.payload,
        ocurridoEn: fila.ocurrido_en,
      };
      const suscriptor = app.get(SuscriptorRecordatorios);
      const transacciones = app.get(TransactionRunner);
      // Primero anula los actuales para forzar una inserción real en la carrera
      await base.query(
        `UPDATE recordatorios SET estado = 'cancelado', motivo = 'reprogramado'
          WHERE cita_id = $1 AND estado = 'programado'`,
        [citaId],
      );

      // Act
      await Promise.all(
        Array.from({ length: 5 }, () =>
          transacciones.run((tx) => suscriptor.manejar(evento, tx)),
        ),
      );

      // Assert — un solo juego nuevo, con la misma clave que el anterior
      const despues = await recordatoriosDe(citaId, general);
      expect(
        programados(despues).map((r) => [r.antelacionMin, r.programadoPara]),
      ).toEqual(
        programados(antes).map((r) => [r.antelacionMin, r.programadoPara]),
      );
      expect(despues).toHaveLength(antes.length + 2);
    });

    it('reagendar y repetir el CitaReagendada 4 veces → 2 programados para la hora nueva, sin duplicar', async () => {
      // Arrange
      const nuevoInicio = alMinuto(reloj().getTime() + 4 * DIA + 2 * HORA);
      await patchCita(general, citaId, 'reagendar', {
        inicio: nuevoInicio.toISOString(),
      });
      await despacharOutbox();
      const trasReagendar = await recordatoriosDe(citaId, general);

      // Act
      expect(await reencolar('CitaReagendada', 3)).toBe(4);
      await despacharOutbox();
      await app.get(PlanificadorRecordatorios).ejecutarRespaldo();

      // Assert
      const final = await recordatoriosDe(citaId, general);
      expect(final).toEqual(trasReagendar);
      expect(
        programados(final)
          .map((r) => r.programadoPara)
          .sort(),
      ).toEqual(
        [
          new Date(nuevoInicio.getTime() - DIA).toISOString(),
          new Date(nuevoInicio.getTime() - 2 * HORA).toISOString(),
        ].sort(),
      );
    });
  });

  describe('configuración del profesional (outbox real)', () => {
    it('cambiarla reprograma SOLO las citas futuras vigentes de ese profesional; apagarla las anula; encenderla las vuelve a programar', async () => {
      // Arrange — una cita futura y una cancelada del profesional, y una de otra organización
      const inicio = alMinuto(reloj().getTime() + 5 * DIA + 3 * HORA);
      const propia = await crearCita(configuracion, inicio);
      const cancelada = await crearCita(configuracion, inicio);
      const deOtro = await crearCita(ajena, inicio);
      await despacharOutbox();
      await patchCita(configuracion, cancelada.id, 'cancelar');
      await despacharOutbox();
      const canceladaAntes = await recordatoriosDe(cancelada.id, configuracion);
      const otroAntes = await recordatoriosDe(deOtro.id, ajena);
      const put = (cuerpo: object) =>
        request(server())
          .put('/api/recordatorios/configuracion')
          .set('Authorization', `Bearer ${configuracion.token}`)
          .send(cuerpo)
          .expect(200);

      // Act 1 — otros momentos
      await put({ activo: true, antelacionesMin: [2880] });
      await despacharOutbox();
      const tras2880 = await recordatoriosDe(propia.id, configuracion);

      // Assert 1
      expect(programados(tras2880).map((r) => r.antelacionMin)).toEqual([2880]);
      expect(
        tras2880
          .filter((r) => r.estado === 'cancelado')
          .map((r) => [r.antelacionMin, r.motivo])
          .sort(),
      ).toEqual(
        [
          [120, 'reprogramado'],
          [1440, 'reprogramado'],
        ].sort(),
      );

      // Act 2 — apagar
      await put({ activo: false, antelacionesMin: [2880] });
      await despacharOutbox();
      const apagada = await recordatoriosDe(propia.id, configuracion);

      // Assert 2
      expect(programados(apagada)).toEqual([]);
      expect(apagada.find((r) => r.antelacionMin === 2880)).toMatchObject({
        estado: 'cancelado',
        motivo: 'desactivado',
      });

      // Act 3 — volver a encender con los momentos de siempre
      await put({ activo: true, antelacionesMin: [1440, 120] });
      await despacharOutbox();
      const encendida = await recordatoriosDe(propia.id, configuracion);

      // Assert 3 — la misma clave vuelve a programarse (los cancelados no la ocupan)
      expect(
        programados(encendida)
          .map((r) => r.antelacionMin)
          .sort(),
      ).toEqual([120, 1440]);
      expect(encendida).toHaveLength(tras2880.length + 2);

      // Ni la cita cancelada ni la de otra organización se tocaron
      expect(await recordatoriosDe(cancelada.id, configuracion)).toEqual(
        canceladaAntes,
      );
      expect(await recordatoriosDe(deOtro.id, ajena)).toEqual(otroAntes);
      expect(programados(otroAntes)).toHaveLength(2);
    });
  });

  describe('estado visible para el profesional', () => {
    it('GET /citas/:id/recordatorios de otro tenant → 404; la propia no trae destinatario ni id del proveedor', async () => {
      // Arrange — una cita con un recordatorio ya enviado
      const [{ cita_id: citaId }] = await base.query<{ cita_id: string }[]>(
        `SELECT cita_id FROM recordatorios
          WHERE tenant_id = $1 AND enviado_en IS NOT NULL LIMIT 1`,
        [limite.tenantId],
      );

      // Act
      await request(server())
        .get(`/api/citas/${citaId}/recordatorios`)
        .set('Authorization', `Bearer ${ajena.token}`)
        .expect(404);
      const propia = await request(server())
        .get(`/api/citas/${citaId}/recordatorios`)
        .set('Authorization', `Bearer ${limite.token}`)
        .expect(200);

      // Assert
      const lista = propia.body as Record<string, unknown>[];
      expect(lista.map((r) => r.estado)).toContain('enviado');
      const claves = new Set(lista.flatMap((r) => Object.keys(r)));
      for (const prohibida of [
        'destinatario',
        'correo',
        'proveedor',
        'proveedorMensajeId',
        'ultimoError',
        'intentos',
        'tenantId',
      ]) {
        expect(claves.has(prohibida)).toBe(false);
      }
      const texto = JSON.stringify(lista);
      expect(texto).not.toContain('@');
      expect(texto).not.toContain('msg_');
    });
  });

  // Al final: deja la cuota global agotada mientras corre (y la restaura).
  describe('cuota local del proveedor (ADR-13 §11)', () => {
    let rellenoCitaId: string;

    beforeAll(async () => {
      rellenoCitaId = (
        await crearCita(ajena, alMinuto(reloj().getTime() + 6 * DIA))
      ).id;
    });

    afterAll(async () => {
      await base.query(`DELETE FROM recordatorios WHERE proveedor = 'relleno'`);
    });

    it(`agotada (${CUOTA_DIARIA} al día) → fallido (cuota_agotada) sin llamar al proveedor; las alertas salen UNA vez por periodo`, async () => {
      // Arrange — el contador local se deriva de enviado_en (día UTC del reloj)
      const ahora = reloj();
      const desde = new Date(
        Date.UTC(
          ahora.getUTCFullYear(),
          ahora.getUTCMonth(),
          ahora.getUTCDate(),
        ),
      );
      const [{ n: yaEnviados }] = await base.query<{ n: number }[]>(
        `SELECT count(*)::int AS n FROM recordatorios
          WHERE enviado_en >= $1 AND enviado_en < $2`,
        [desde, new Date(desde.getTime() + DIA)],
      );
      expect(yaEnviados).toBeLessThan(CUOTA_DIARIA * 0.8);
      // Relleno en OTRA organización (no toca el tope por tenant de `cuota`)
      await base.query(
        `INSERT INTO recordatorios
           (tenant_id, cita_id, canal, antelacion_min, inicio_cita, programado_para,
            vence_en, estado, motivo, proximo_intento_en, enviado_en, proveedor, intentos)
         SELECT $1, $2, 'email', 20000 + g, $3, $3, $3, 'enviado', NULL, $3, $3, 'relleno', 1
           FROM generate_series(1, $4::int) g`,
        [ajena.tenantId, rellenoCitaId, ahora, CUOTA_DIARIA - yaEnviados],
      );
      const primero = await citaTardia(cuota);
      const segundo = await citaTardia(cuota);
      const llamadasAntes = canal.enviados.length;
      const alertasAntes = bitacora.entradas.length;

      // Act — vencen en 1 h; la cuota reinicia a medianoche UTC (~9 h): no alcanza
      await ejecutarEnvio();

      // Assert
      expect(canal.enviados.length).toBe(llamadasAntes);
      for (const t of [primero, segundo]) {
        expect(await estadoDe(t.cita.id, t.tardioId, cuota)).toMatchObject({
          estado: 'fallido',
          motivo: 'cuota_agotada',
        });
      }
      const nuevas = bitacora.entradas.slice(alertasAntes);
      const agotada = nuevas.filter(
        (e) => e.alerta === AlertaRecordatorios.CUOTA_AGOTADA,
      );
      expect(agotada).toHaveLength(1);
      expect(agotada[0].campos).toMatchObject({
        alcance: 'dia',
        origen: 'local',
      });
      expect(
        bitacora
          .alertas(AlertaRecordatorios.CUOTA_80)
          .filter((e) => e.campos.alcance === 'dia'),
      ).toHaveLength(1);
      expect(
        nuevas.filter(
          (e) =>
            e.evento === 'recordatorio.fallido' &&
            e.campos.motivo === 'cuota_agotada',
        ),
      ).toHaveLength(2);
    });
  });
});
