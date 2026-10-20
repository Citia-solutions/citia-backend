// PRIMERO: entorno de test (NODE_ENV=test, PLANIFICADOR_ACTIVO=false,
// LIMITE_TASA_ACTIVO=false y la base de test en DB_*), antes de que se arme el
// ConfigModule.
import './support/entorno-app-e2e';

import { createHash } from 'node:crypto';

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';

import { AuthModule } from '../src/modules/auth/auth.module';
import { EnlacesCitaService } from '../src/modules/cita/application/enlaces-cita.service';
import { CitaModule } from '../src/modules/cita/cita.module';
import { PacienteModule } from '../src/modules/paciente/paciente.module';
import { PortalPacienteModule } from '../src/modules/portal-paciente/portal-paciente.module';
import { SolicitudModule } from '../src/modules/solicitud/solicitud.module';
import { TenantModule } from '../src/modules/tenant/tenant.module';
import { UsuariosModule } from '../src/modules/usuario/usuarios.module';
import { TransactionRunner } from '../src/shared/application/transaction-runner';
import { validarEntorno } from '../src/shared/infrastructure/config/entorno';
import { PlanificadorSalida } from '../src/shared/infrastructure/planificacion/planificador-salida';
import { ObservabilidadModule } from '../src/shared/observabilidad.module';
import { PlanificacionModule } from '../src/shared/planificacion.module';

/**
 * Portal del paciente de punta a punta (Fase 3, contrato §3.4) con
 * PostgreSQL real: los módulos reales (`cita`, `solicitud`,
 * `portal-paciente`), el outbox (despacho a mano) y la bandeja.
 *
 *   ver → confirmar (voucher: confirmadaPor = paciente)
 *   ver → pedir otra hora → aparece en la bandeja → aceptar MUEVE la misma
 *   cita → el MISMO enlace sirve para la hora nueva
 *   cancelar con una petición abierta → el suscriptor la descarta
 *   reagendar desde el voucher con una petición abierta → queda atendida
 *   404 uniforme (seis formas, cuatro rutas) y 409 uniforme
 *   carrera real de dos peticiones de otra hora (23505 → 409)
 *
 * El token se obtiene como lo obtiene el recordatorio:
 * `EnlacesCitaService.asegurarActivo` en una transacción.
 *
 * ⚠️ REQUIERE PostgreSQL real (vars TEST_DB_*), con synchronize + dropSchema
 * (las entidades ORM declaran los índices parciales y CHECK de las
 * migraciones).
 */

const HORA = 60 * 60 * 1000;
const DIA = 24 * HORA;
const CABECERA = 'X-Enlace-Cita';

const CUERPO_404 = {
  statusCode: 404,
  message: 'Enlace no válido o vencido',
};
const CUERPO_409 = {
  statusCode: 409,
  message: 'Esta acción ya no está disponible',
};

interface RegistroBody {
  tenantId: string;
  tenantSlug: string;
}
interface LoginBody {
  accessToken: string;
}
interface CitaBody {
  id: string;
  inicio: string;
  estado: string;
}
interface VistaBody {
  inicio: string;
  zonaHoraria: string;
  duracionMin: number;
  estado: string;
  profesional: string;
  organizacion: string;
  accionesPermitidas: string[];
  solicitudOtraHora: { preferencia: string; solicitadaEn: string } | null;
}
interface SolicitudBody {
  id: string;
  estado: string;
  tipo: string;
  rut: string | null;
  citaId: string | null;
  citaOrigenId: string | null;
  citaOrigen: { inicio: string; duracionMin: number; estado: string } | null;
  nombrePaciente: string;
  preferenciaHoraria: string;
  motivo: string;
  resueltaEn: string | null;
}
interface AceptadaBody {
  solicitud: SolicitudBody;
  cita: CitaBody;
}
interface DetalleBody extends CitaBody {
  confirmadaPor: string | null;
  canceladaPor: string | null;
}
/** Una fila de la bitácora `cambios_cita`, en el orden en que ocurrió. */
interface CambioFila {
  tipo: string;
  actorTipo: string;
  actorId: string | null;
  estadoAnterior: string | null;
  estadoNuevo: string | null;
}
/** Un hecho del outbox `eventos_salida`. */
interface EventoFila {
  nombre: string;
  payload: Record<string, unknown>;
}

interface Organizacion {
  token: string;
  tenantId: string;
  tenantSlug: string;
}

/** Instante redondeado al minuto (lo que guarda la cita). */
const alMinuto = (ms: number): Date =>
  new Date(Math.ceil(ms / 60_000) * 60_000);

/** RUT chileno válido (módulo 11) para un cuerpo dado, con puntos y guion. */
const rutValido = (cuerpo: number): string => {
  const digitos = String(cuerpo);
  let suma = 0;
  let factor = 2;
  for (let i = digitos.length - 1; i >= 0; i--) {
    suma += Number(digitos[i]) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }
  const resto = 11 - (suma % 11);
  const dv = resto === 11 ? '0' : resto === 10 ? 'K' : String(resto);
  return `${digitos.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}-${dv}`;
};

/** RUT sin puntos ni guion, en mayúsculas: para comparar formatos. */
const rutCanonico = (rut: string | null): string =>
  (rut ?? '').replace(/[.-]/g, '').toUpperCase();

describe('Portal del paciente /api/publico/cita (e2e con Postgres)', () => {
  let app: INestApplication;
  let datos: DataSource;
  let a: Organizacion;
  let b: Organizacion;
  let siguiente = 0;

  const server = (): App => app.getHttpServer() as App;

  const despacharOutbox = async (): Promise<void> => {
    await app.get(PlanificadorSalida).ejecutarDespacho();
  };

  const registrar = async (n: string): Promise<Organizacion> => {
    const cred = {
      nombreTenant: `Clinica Portal ${n}`,
      email: `admin@portal-${n}.com`,
      password: 'password1234',
      nombreCompleto: `Dra. Portal ${n}`,
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
      tenantSlug,
    };
  };

  const crearCita = async (
    org: Organizacion,
    inicio = alMinuto(Date.now() + 3 * DIA + siguiente * HORA),
    rut?: string,
  ): Promise<CitaBody> => {
    siguiente++;
    const res = await request(server())
      .post('/api/citas')
      .set('Authorization', `Bearer ${org.token}`)
      .send({
        inicio: inicio.toISOString(),
        duracionMin: 45,
        tipoConsulta: 'Endodoncia (privado)',
        paciente: {
          ...(rut === undefined ? {} : { rut }),
          nombre: `Paciente Secreta ${siguiente}`,
          telefono: '+56 9 8765 4321',
          correo: `secreta${siguiente}@correo.cl`,
          consentimiento: true,
        },
      })
      .expect(201);
    return res.body as CitaBody;
  };

  /** Acción del profesional desde el voucher (`PATCH /api/citas/:id/<accion>`). */
  const desdeVoucher = (
    cita: CitaBody,
    accion: string,
    cuerpo: object = {},
    org: Organizacion = a,
  ) =>
    request(server())
      .patch(`/api/citas/${cita.id}/${accion}`)
      .set('Authorization', `Bearer ${org.token}`)
      .send(cuerpo);

  /** Id del usuario (profesional) de la organización: el `actor_id` del profesional. */
  const usuarioDe = async (org: Organizacion): Promise<string> => {
    const [{ id }] = await datos.query<{ id: string }[]>(
      'SELECT id::text AS id FROM usuarios WHERE tenant_id = $1',
      [org.tenantId],
    );
    return id;
  };

  /** Id del enlace ACTIVO de la cita: el `actor_id` del paciente. */
  const enlaceActivoDe = async (cita: CitaBody): Promise<string> => {
    const [{ id }] = await datos.query<{ id: string }[]>(
      `SELECT id::text AS id FROM enlaces_cita
        WHERE cita_id = $1 AND revocado_en IS NULL`,
      [cita.id],
    );
    return id;
  };

  /** La bitácora de la cita en orden. */
  const bitacoraDe = (cita: CitaBody): Promise<CambioFila[]> =>
    datos.query<CambioFila[]>(
      `SELECT tipo::text            AS "tipo",
              actor_tipo::text      AS "actorTipo",
              actor_id::text        AS "actorId",
              estado_anterior::text AS "estadoAnterior",
              estado_nuevo::text    AS "estadoNuevo"
         FROM cambios_cita
        WHERE cita_id = $1
        ORDER BY ocurrido_en, id`,
      [cita.id],
    );

  /** `pedido_por` de los cambios de un tipo (US-07.01), en orden. */
  const pedidoPorDe = async (
    cita: CitaBody,
    tipo: string,
  ): Promise<(string | null)[]> =>
    (
      await datos.query<{ pedidoPor: string | null }[]>(
        `SELECT pedido_por::text AS "pedidoPor" FROM cambios_cita
          WHERE cita_id = $1 AND tipo::text = $2
          ORDER BY ocurrido_en, id`,
        [cita.id, tipo],
      )
    ).map((f) => f.pedidoPor);

  /** Los hechos del outbox de la cita, en orden. */
  const hechosDe = (cita: CitaBody): Promise<EventoFila[]> =>
    datos.query<EventoFila[]>(
      `SELECT nombre, payload FROM eventos_salida
        WHERE payload->>'citaId' = $1
        ORDER BY ocurrido_en, creado_en`,
      [cita.id],
    );

  /** Hechos de la cita que no se entregaron o que fallaron alguna vez. */
  const hechosConProblemas = async (cita: CitaBody): Promise<number> => {
    const [{ n }] = await datos.query<{ n: number }[]>(
      `SELECT count(*)::int AS n FROM eventos_salida
        WHERE payload->>'citaId' = $1
          AND (estado <> 'entregado' OR ultimo_error IS NOT NULL)`,
      [cita.id],
    );
    return n;
  };

  /** Token del enlace activo, como lo emite el envío del recordatorio (E3). */
  const tokenDe = (cita: CitaBody, org: Organizacion): Promise<string> =>
    app
      .get(TransactionRunner)
      .run((tx) =>
        app.get(EnlacesCitaService).asegurarActivo(cita.id, org.tenantId, tx),
      );

  const ver = (token?: string) => {
    const req = request(server()).get('/api/publico/cita');
    return token === undefined ? req : req.set(CABECERA, token);
  };

  const post = (ruta: string, token?: string, cuerpo: object = {}) => {
    const req = request(server()).post(`/api/publico/cita/${ruta}`);
    return (token === undefined ? req : req.set(CABECERA, token)).send(cuerpo);
  };

  const detalle = async (
    cita: CitaBody,
    org: Organizacion = a,
  ): Promise<DetalleBody> =>
    (
      await request(server())
        .get(`/api/citas/${cita.id}`)
        .set('Authorization', `Bearer ${org.token}`)
        .expect(200)
    ).body as DetalleBody;

  /** Las dos cabeceras de toda respuesta pública (S3), sea cual sea el status. */
  const exigirCabecerasPublicas = (res: request.Response): void => {
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['referrer-policy']).toBe('no-referrer');
  };

  const solicitudesDe = async (
    cita: CitaBody,
    estado: string,
    org: Organizacion = a,
  ): Promise<SolicitudBody[]> =>
    (
      await request(server())
        .get(`/api/solicitudes?citaOrigenId=${cita.id}&estado=${estado}`)
        .set('Authorization', `Bearer ${org.token}`)
        .expect(200)
    ).body as SolicitudBody[];

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
        PortalPacienteModule,
        PlanificacionModule,
      ],
    }).compile();

    // Igual que src/main.ts.
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
    datos = app.get(DataSource);

    a = await registrar('a');
    b = await registrar('b');
  }, 60_000);

  afterAll(async () => {
    await app?.close();
  });

  it('se conecta a la base de test', () => {
    expect(datos.options.database).toBe(
      process.env.TEST_DB_NAME ?? 'citia_test',
    );
  });

  // ---------------------------------------------------------------------------
  describe('flujo feliz: ver → confirmar', () => {
    let cita: CitaBody;
    let token: string;

    beforeAll(async () => {
      cita = await crearCita(a);
      token = await tokenDe(cita, a);
    });

    it('GET → 200 con la vista mínima, no-store y no-referrer', async () => {
      // Act
      const res = await ver(token).expect(200);

      // Assert
      expect(res.body).toEqual({
        inicio: cita.inicio,
        zonaHoraria: 'America/Santiago',
        duracionMin: 45,
        estado: 'pendiente',
        profesional: 'Dra. Portal a',
        organizacion: 'Clinica Portal a',
        accionesPermitidas: ['confirmar', 'cancelar', 'pedirOtraHora'],
        solicitudOtraHora: null,
      });
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.headers['referrer-policy']).toBe('no-referrer');
      // Nada del paciente, del tipo de consulta ni ids
      expect(res.text).not.toMatch(/Secreta|8765|correo\.cl|Endodoncia/);
      expect(res.text).not.toContain(cita.id);
      expect(res.text).not.toContain(a.tenantId);
    });

    it('abrir la página N veces no cambia la cita, la bitácora ni el outbox', async () => {
      // Arrange
      const contar = async () => {
        const [{ cambios }] = await datos.query<{ cambios: number }[]>(
          'SELECT count(*)::int AS cambios FROM cambios_cita WHERE cita_id = $1',
          [cita.id],
        );
        const [{ eventos }] = await datos.query<{ eventos: number }[]>(
          'SELECT count(*)::int AS eventos FROM eventos_salida',
        );
        // US-07.01: la fila de la cita tampoco cambia, y la primera apertura
        // (la anotó el GET anterior) no se vuelve a escribir.
        const [{ actualizadoEn }] = await datos.query<
          { actualizadoEn: Date }[]
        >('SELECT actualizado_en AS "actualizadoEn" FROM citas WHERE id = $1', [
          cita.id,
        ]);
        const [{ apertura }] = await datos.query<{ apertura: Date | null }[]>(
          `SELECT primera_apertura_en AS apertura FROM enlaces_cita
            WHERE cita_id = $1 AND revocado_en IS NULL`,
          [cita.id],
        );
        return {
          cambios,
          eventos,
          estado: (await detalle(cita)).estado,
          actualizadoEn,
          apertura,
        };
      };
      const antes = await contar();

      // Act
      for (let i = 0; i < 3; i++) await ver(token).expect(200);

      // Assert
      expect(await contar()).toEqual(antes);
    });

    it('POST confirmar → 200 confirmada; el voucher dice confirmadaPor = paciente', async () => {
      // Act
      const res = await post('confirmar', token).expect(200);

      // Assert
      const vista = res.body as VistaBody;
      expect(vista.estado).toBe('confirmada');
      expect(vista.accionesPermitidas).toEqual(['cancelar', 'pedirOtraHora']);
      exigirCabecerasPublicas(res);
      const voucher = await detalle(cita);
      expect(voucher.estado).toBe('confirmada');
      expect(voucher.confirmadaPor).toBe('paciente');
      // Bitácora: actor paciente con el id del enlace (no el token)
      const [cambio] = await datos.query<
        { actor_tipo: string; actor_id: string }[]
      >(
        `SELECT actor_tipo::text AS actor_tipo, actor_id::text AS actor_id
           FROM cambios_cita WHERE cita_id = $1 AND tipo::text = 'confirmada'`,
        [cita.id],
      );
      const [enlace] = await datos.query<{ id: string }[]>(
        'SELECT id::text AS id FROM enlaces_cita WHERE cita_id = $1',
        [cita.id],
      );
      expect(cambio).toEqual({ actor_tipo: 'paciente', actor_id: enlace.id });
    });

    it('confirmar otra vez → 409 con el cuerpo exacto', async () => {
      // Act
      const res = await post('confirmar', token).expect(409);

      // Assert
      expect(res.body).toEqual(CUERPO_409);
      exigirCabecerasPublicas(res);
    });
  });

  // ---------------------------------------------------------------------------
  // US-07.01 (H5): la primera vez que el paciente abre su enlace con un token
  // válido queda la fecha en `enlaces_cita.primera_apertura_en`. La página se
  // ve igual y la cita no cambia.
  describe('primera apertura del enlace (US-07.01, H5)', () => {
    const aperturaDe = async (
      cita: CitaBody,
      version?: number,
    ): Promise<Date | null> => {
      const [fila] = await datos.query<{ apertura: Date | null }[]>(
        version === undefined
          ? `SELECT primera_apertura_en AS apertura FROM enlaces_cita
              WHERE cita_id = $1 AND revocado_en IS NULL`
          : `SELECT primera_apertura_en AS apertura FROM enlaces_cita
              WHERE cita_id = $1 AND version = $2`,
        version === undefined ? [cita.id] : [cita.id, version],
      );
      return fila.apertura;
    };

    it('el primer GET válido la llena y los siguientes no la cambian; la vista y las cabeceras son las de siempre', async () => {
      // Arrange
      const cita = await crearCita(a);
      const token = await tokenDe(cita, a);
      expect(await aperturaDe(cita)).toBeNull();
      const antes = Date.now();

      // Act
      const primera = await ver(token).expect(200);
      const despues = Date.now();
      const apertura = await aperturaDe(cita);
      const siguientes: request.Response[] = [];
      for (let i = 0; i < 3; i++) siguientes.push(await ver(token).expect(200));

      // Assert — la fecha es la del primer GET (reloj de la app)
      expect(apertura).toBeInstanceOf(Date);
      expect(apertura!.getTime()).toBeGreaterThanOrEqual(antes - 1_000);
      expect(apertura!.getTime()).toBeLessThanOrEqual(despues + 1_000);
      expect(await aperturaDe(cita)).toEqual(apertura);
      // La página se ve igual: mismo cuerpo, mismas claves, mismas cabeceras
      for (const res of siguientes) {
        expect(res.body).toEqual(primera.body);
        exigirCabecerasPublicas(res);
      }
      expect(Object.keys(primera.body as VistaBody).sort()).toEqual(
        [
          'accionesPermitidas',
          'duracionMin',
          'estado',
          'inicio',
          'organizacion',
          'profesional',
          'solicitudOtraHora',
          'zonaHoraria',
        ].sort(),
      );
      // La cita no cambió: sin bitácora ni hechos más allá del alta
      expect((await bitacoraDe(cita)).map((c) => c.tipo)).toEqual(['creada']);
      expect((await hechosDe(cita)).map((h) => h.nombre)).toEqual([
        'CitaCreada',
      ]);
    });

    it('los POST no la anotan: confirmar sin haber abierto la página la deja vacía', async () => {
      // Arrange
      const cita = await crearCita(a);
      const token = await tokenDe(cita, a);

      // Act
      await post('confirmar', token).expect(200);

      // Assert
      expect(await aperturaDe(cita)).toBeNull();
    });

    it('se guarda por versión: tras invalidar, el enlace nuevo empieza sin apertura y el viejo conserva la suya', async () => {
      // Arrange — v1 abierta
      const cita = await crearCita(a);
      const v1 = await tokenDe(cita, a);
      await ver(v1).expect(200);
      const aperturaV1 = await aperturaDe(cita, 1);
      expect(aperturaV1).toBeInstanceOf(Date);

      // Act — el profesional invalida y el siguiente recordatorio emite la v2
      await request(server())
        .post(`/api/citas/${cita.id}/enlace/invalidar`)
        .set('Authorization', `Bearer ${a.token}`)
        .expect(204);
      const v2 = await tokenDe(cita, a);

      // Assert
      expect(v2).not.toBe(v1);
      expect(await aperturaDe(cita, 2)).toBeNull();
      await ver(v1).expect(404);
      expect(await aperturaDe(cita, 2)).toBeNull();
      await ver(v2).expect(200);
      expect(await aperturaDe(cita, 2)).toBeInstanceOf(Date);
      expect(await aperturaDe(cita, 1)).toEqual(aperturaV1);
    });
  });

  // ---------------------------------------------------------------------------
  describe('ver → pedir otra hora → bandeja → aceptar mueve la MISMA cita', () => {
    let cita: CitaBody;
    let token: string;
    let solicitudId: string;
    const nuevaHora = alMinuto(Date.now() + 5 * DIA);

    beforeAll(async () => {
      cita = await crearCita(a);
      token = await tokenDe(cita, a);
    });

    it('POST otra-hora → 201; la cita no se mueve; solo queda cancelar', async () => {
      // Arrange
      await ver(token).expect(200);

      // Act
      const res = await post('otra-hora', token, {
        preferencia: '  martes en la tarde  ',
        motivo: 'cambio de turno',
      }).expect(201);

      // Assert
      exigirCabecerasPublicas(res);
      const vista = res.body as VistaBody;
      expect(vista.estado).toBe('pendiente');
      expect(vista.inicio).toBe(cita.inicio);
      expect(vista.accionesPermitidas).toEqual(['cancelar']);
      // Matcher asimétrico tipado como `unknown` (expect.stringMatching es `any`).
      const unInstanteIso: unknown = expect.stringMatching(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
      );
      expect(vista.solicitudOtraHora).toEqual({
        preferencia: 'martes en la tarde',
        solicitadaEn: unInstanteIso,
      });
      const voucher = await detalle(cita);
      expect(voucher.estado).toBe('pendiente');
      expect(voucher.inicio).toBe(cita.inicio);
    });

    it('con la petición abierta: otra petición → 409 y confirmar → 409', async () => {
      expect(
        (await post('otra-hora', token, { preferencia: 'otra' }).expect(409))
          .body,
      ).toEqual(CUERPO_409);
      expect((await post('confirmar', token).expect(409)).body).toEqual(
        CUERPO_409,
      );
    });

    it('aparece en la bandeja (voucher: ?citaOrigenId=&estado=recibida) con su cita de origen', async () => {
      // Act
      const lista = await solicitudesDe(cita, 'recibida');

      // Assert
      expect(lista).toHaveLength(1);
      expect(lista[0]).toMatchObject({
        estado: 'recibida',
        tipo: 'reagendamiento',
        citaOrigenId: cita.id,
        citaOrigen: {
          inicio: cita.inicio,
          duracionMin: 45,
          estado: 'pendiente',
        },
        preferenciaHoraria: 'martes en la tarde',
        motivo: 'cambio de turno',
        nombrePaciente: expect.stringMatching(/^Paciente Secreta/) as unknown,
      });
      solicitudId = lista[0].id;
      // Otro tenant no la ve
      expect(await solicitudesDe(cita, 'recibida', b)).toEqual([]);
    });

    it('guarda el enlace y el dueño de la cita, y publica ReagendamientoSolicitado con solo ids y el actor paciente', async () => {
      // Arrange
      const enlaceId = await enlaceActivoDe(cita);
      const duenio = await usuarioDe(a);

      // Act
      const [fila] = await datos.query<
        {
          tipo: string;
          estado: string;
          citaOrigenId: string;
          enlaceId: string;
          usuarioId: string;
        }[]
      >(
        `SELECT tipo::text AS tipo, estado::text AS estado,
                cita_origen_id::text AS "citaOrigenId",
                enlace_id::text AS "enlaceId", usuario_id::text AS "usuarioId"
           FROM solicitudes_cita WHERE id = $1`,
        [solicitudId],
      );
      const hecho = (await hechosDe(cita)).find(
        (h) => h.nombre === 'ReagendamientoSolicitado',
      );

      // Assert
      expect(fila).toEqual({
        tipo: 'reagendamiento',
        estado: 'recibida',
        citaOrigenId: cita.id,
        enlaceId,
        usuarioId: duenio,
      });
      expect(hecho?.payload).toEqual({
        citaId: cita.id,
        usuarioId: duenio,
        solicitudId,
        actor: { tipo: 'paciente', id: enlaceId },
      });
      // La cita no se tocó: ni bitácora ni hechos de cita por pedir otra hora
      expect((await bitacoraDe(cita)).map((c) => c.tipo)).toEqual(['creada']);
    });

    it('aceptar con solo fecha y hora → 201 y mueve la MISMA cita (pendiente, hora nueva)', async () => {
      // Arrange
      const contarCitas = async (): Promise<number> => {
        const [{ n }] = await datos.query<{ n: number }[]>(
          'SELECT count(*)::int AS n FROM citas WHERE tenant_id = $1',
          [a.tenantId],
        );
        return n;
      };
      const citasAntes = await contarCitas();

      // Act
      const res = await request(server())
        .post(`/api/solicitudes/${solicitudId}/aceptar`)
        .set('Authorization', `Bearer ${a.token}`)
        .send({ inicio: nuevaHora.toISOString() })
        .expect(201);

      // Assert
      const body = res.body as AceptadaBody;
      expect(body.cita.id).toBe(cita.id);
      expect(body.cita.estado).toBe('pendiente');
      expect(body.cita.inicio).toBe(nuevaHora.toISOString());
      expect(body.solicitud).toMatchObject({
        id: solicitudId,
        estado: 'aceptada',
        citaId: cita.id,
        citaOrigen: { inicio: nuevaHora.toISOString(), estado: 'pendiente' },
      });
      const voucher = await detalle(cita);
      expect(voucher.inicio).toBe(nuevaHora.toISOString());
      // Ni cita ni paciente nuevos: se movió la de origen
      expect(await contarCitas()).toBe(citasAntes);
      expect(await solicitudesDe(cita, 'recibida')).toEqual([]);
    });

    it('el MISMO enlace sirve para la hora nueva, con todas las acciones de nuevo', async () => {
      // Act
      const res = await ver(token).expect(200);

      // Assert
      expect(res.body).toMatchObject({
        inicio: nuevaHora.toISOString(),
        estado: 'pendiente',
        accionesPermitidas: ['confirmar', 'cancelar', 'pedirOtraHora'],
        solicitudOtraHora: null,
      });
    });

    it('el outbox se despacha sin errores y nada cambia (la petición ya estaba aceptada)', async () => {
      // Act
      await despacharOutbox();

      // Assert
      const [pendientes] = await datos.query<{ n: number }[]>(
        `SELECT count(*)::int AS n FROM eventos_salida
          WHERE estado <> 'entregado' OR ultimo_error IS NOT NULL`,
      );
      expect(pendientes.n).toBe(0);
      expect(await solicitudesDe(cita, 'aceptada')).toHaveLength(1);
    });
  });

  // ---------------------------------------------------------------------------
  describe('suscriptor del outbox (SuscriptorSolicitudes)', () => {
    it('cancelar con una petición abierta → vista cancelada sin acciones, GET 404, y el despacho la descarta', async () => {
      // Arrange
      const cita = await crearCita(a);
      const token = await tokenDe(cita, a);
      await post('otra-hora', token, { preferencia: 'jueves' }).expect(201);

      // Act
      const res = await post('cancelar', token, {
        motivo: '  ya no puedo  ',
      }).expect(200);

      // Assert — la vista
      expect(res.body).toMatchObject({
        estado: 'cancelada',
        accionesPermitidas: [],
        solicitudOtraHora: null,
      });
      expect((await ver(token).expect(404)).body).toEqual(CUERPO_404);
      // El portal no la descarta: lo hace el suscriptor
      expect(await solicitudesDe(cita, 'recibida')).toHaveLength(1);
      await despacharOutbox();
      expect(await solicitudesDe(cita, 'recibida')).toEqual([]);
      const descartadas = await solicitudesDe(cita, 'descartada');
      expect(descartadas).toHaveLength(1);
      expect(descartadas[0].citaId).toBeNull();
    });

    it('reagendar desde el voucher con una petición abierta → queda atendida (aceptada, citaId = la cita)', async () => {
      // Arrange
      const cita = await crearCita(a);
      const token = await tokenDe(cita, a);
      await post('otra-hora', token, { preferencia: 'viernes' }).expect(201);

      // Act
      await request(server())
        .patch(`/api/citas/${cita.id}/reagendar`)
        .set('Authorization', `Bearer ${a.token}`)
        .send({ inicio: alMinuto(Date.now() + 6 * DIA).toISOString() })
        .expect(200);
      await despacharOutbox();

      // Assert
      expect(await solicitudesDe(cita, 'recibida')).toEqual([]);
      const atendidas = await solicitudesDe(cita, 'aceptada');
      expect(atendidas).toHaveLength(1);
      expect(atendidas[0].citaId).toBe(cita.id);
    });
  });

  // ---------------------------------------------------------------------------
  describe('404 uniforme: seis formas de enlace no válido, cuatro rutas', () => {
    const tokens: Record<string, string | undefined> = {};
    const citasConEnlace: CitaBody[] = [];
    /** Bitácora y outbox de las tres citas, ANTES de las 24 peticiones rechazadas. */
    let rastroAntes: { cambios: number; hechos: number };

    const rastro = async (): Promise<{ cambios: number; hechos: number }> => {
      const ids = citasConEnlace.map((c) => c.id);
      const [{ cambios }] = await datos.query<{ cambios: number }[]>(
        `SELECT count(*)::int AS cambios FROM cambios_cita
          WHERE cita_id = ANY($1::uuid[])`,
        [ids],
      );
      const [{ hechos }] = await datos.query<{ hechos: number }[]>(
        `SELECT count(*)::int AS hechos FROM eventos_salida
          WHERE payload->>'citaId' = ANY($1::text[])`,
        [ids],
      );
      return { cambios, hechos };
    };

    beforeAll(async () => {
      tokens['cabecera ausente'] = undefined;
      tokens['formato incorrecto'] = 'esto-no-es-un-token';
      tokens['inexistente'] = 'A'.repeat(43);

      const revocada = await crearCita(a);
      citasConEnlace.push(revocada);
      tokens['revocado'] = await tokenDe(revocada, a);
      await request(server())
        .post(`/api/citas/${revocada.id}/enlace/invalidar`)
        .set('Authorization', `Bearer ${a.token}`)
        .expect(204);

      const terminal = await crearCita(a);
      citasConEnlace.push(terminal);
      tokens['cita terminal'] = await tokenDe(terminal, a);
      await request(server())
        .patch(`/api/citas/${terminal.id}/cancelar`)
        .set('Authorization', `Bearer ${a.token}`)
        .send({})
        .expect(200);

      const pasada = await crearCita(a);
      citasConEnlace.push(pasada);
      tokens['inicio ya pasado'] = await tokenDe(pasada, a);
      await datos.query(
        `UPDATE citas SET inicio = now() - interval '1 minute' WHERE id = $1`,
        [pasada.id],
      );

      rastroAntes = await rastro();
    }, 30_000);

    const rutas: [string, (t?: string) => request.Test][] = [
      ['GET', (t) => ver(t)],
      ['POST confirmar', (t) => post('confirmar', t)],
      ['POST cancelar', (t) => post('cancelar', t, { motivo: 'x' })],
      ['POST otra-hora', (t) => post('otra-hora', t, { preferencia: 'x' })],
    ];

    it.each(rutas)(
      '%s: las seis formas responden EXACTAMENTE lo mismo',
      async (_ruta, pedir) => {
        const respuestas: {
          caso: string;
          texto: string;
          cacheControl: unknown;
          referrer: unknown;
        }[] = [];
        for (const caso of Object.keys(tokens)) {
          const res = await pedir(tokens[caso]).expect(404);
          respuestas.push({
            caso,
            texto: res.text,
            cacheControl: res.headers['cache-control'],
            referrer: res.headers['referrer-policy'],
          });
        }

        expect(respuestas).toHaveLength(6);
        for (const r of respuestas) {
          expect(JSON.parse(r.texto)).toEqual(CUERPO_404);
          expect(r.texto).toBe(respuestas[0].texto);
          expect(r.cacheControl).toBe('no-store');
          expect(r.referrer).toBe('no-referrer');
        }
      },
    );

    it('ninguna acción rechazada cambió nada: sin cambios del paciente ni peticiones', async () => {
      const ids = citasConEnlace.map((c) => c.id);
      const [{ cambios }] = await datos.query<{ cambios: number }[]>(
        `SELECT count(*)::int AS cambios FROM cambios_cita
          WHERE cita_id = ANY($1::uuid[]) AND actor_tipo::text = 'paciente'`,
        [ids],
      );
      const [{ peticiones }] = await datos.query<{ peticiones: number }[]>(
        `SELECT count(*)::int AS peticiones FROM solicitudes_cita
          WHERE cita_origen_id = ANY($1::uuid[])`,
        [ids],
      );
      expect({ cambios, peticiones }).toEqual({ cambios: 0, peticiones: 0 });
      // Ni la bitácora ni el outbox de esas citas se movieron (nada después
      // de inicio, nada con un enlace revocado ni con la cita terminal)
      expect(await rastro()).toEqual(rastroAntes);
      // La de inicio pasado sigue pendiente (nadie la confirmó ni canceló)
      expect((await detalle(citasConEnlace[2])).estado).toBe('pendiente');
    });

    it('ningún 404 anotó una primera apertura (US-07.01, H5): la columna sigue vacía en los tres enlaces', async () => {
      // Act
      const filas = await datos.query<
        { version: number; apertura: Date | null }[]
      >(
        `SELECT version, primera_apertura_en AS apertura FROM enlaces_cita
          WHERE cita_id = ANY($1::uuid[])
          ORDER BY cita_id, version`,
        [citasConEnlace.map((c) => c.id)],
      );

      // Assert — revocado, cita terminal e inicio pasado: ninguno se abrió
      expect(filas).toHaveLength(3);
      expect(filas.every((f) => f.apertura === null)).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  describe('aislamiento y privacidad', () => {
    it('el enlace de una cita no mueve otra cita del mismo tenant', async () => {
      // Arrange
      const citaA1 = await crearCita(a);
      const citaA2 = await crearCita(a);
      const tokenA1 = await tokenDe(citaA1, a);
      await tokenDe(citaA2, a);

      // Act
      await post('confirmar', tokenA1).expect(200);

      // Assert
      expect((await detalle(citaA1)).estado).toBe('confirmada');
      expect((await detalle(citaA2)).estado).toBe('pendiente');
    });

    it('cada enlace muestra los nombres de SU organización', async () => {
      // Arrange
      const citaB = await crearCita(b);
      const tokenB = await tokenDe(citaB, b);

      // Act
      const res = await ver(tokenB).expect(200);

      // Assert
      expect(res.body).toMatchObject({
        profesional: 'Dra. Portal b',
        organizacion: 'Clinica Portal b',
      });
    });

    it('ni el token ni su hash aparecen en el outbox', async () => {
      // Arrange
      const cita = await crearCita(a);
      const token = await tokenDe(cita, a);
      await post('otra-hora', token, { preferencia: 'lunes' }).expect(201);
      await post('cancelar', token).expect(200);
      const hash = createHash('sha256').update(token).digest('hex');

      // Act
      const filas = await datos.query<{ payload: string }[]>(
        'SELECT payload::text AS payload FROM eventos_salida',
      );

      // Assert
      const todo = filas.map((f) => f.payload).join('\n');
      // Los hechos de esta cita están (ReagendamientoSolicitado, CitaCancelada)…
      expect(todo).toContain(cita.id);
      // …pero nunca el token ni su hash
      expect(todo).not.toContain(token);
      expect(todo).not.toContain(hash);
    });
  });

  // ---------------------------------------------------------------------------
  describe('aislamiento entre tenants y ruta autenticada de invalidar', () => {
    it('el enlace de otro tenant solo actúa sobre SU cita, aunque la petición traiga ids de otra', async () => {
      // Arrange
      const citaA = await crearCita(a);
      await tokenDe(citaA, a);
      const citaB = await crearCita(b);
      const tokenB = await tokenDe(citaB, b);

      // Act — ids ajenos en la query y en el cuerpo (el DTO los descarta)
      const vista = await request(server())
        .get(`/api/publico/cita?citaId=${citaA.id}&tenantId=${a.tenantId}`)
        .set(CABECERA, tokenB)
        .expect(200);
      const cancelada = await post('cancelar', tokenB, {
        motivo: 'no puedo',
        citaId: citaA.id,
        tenantId: a.tenantId,
      }).expect(200);

      // Assert
      expect((vista.body as VistaBody).inicio).toBe(citaB.inicio);
      expect((vista.body as VistaBody).organizacion).toBe('Clinica Portal b');
      expect((cancelada.body as VistaBody).inicio).toBe(citaB.inicio);
      expect((await detalle(citaB, b)).estado).toBe('cancelada');
      expect((await detalle(citaA, a)).estado).toBe('pendiente');
      expect(await bitacoraDe(citaA)).toHaveLength(1); // solo `creada`
    });

    it('POST /api/citas/:id/enlace/invalidar con el JWT de otro tenant → 404 como una inexistente, y el enlace sigue sirviendo', async () => {
      // Arrange
      const citaB = await crearCita(b);
      const tokenB = await tokenDe(citaB, b);
      const invalidar = (id: string) =>
        request(server())
          .post(`/api/citas/${id}/enlace/invalidar`)
          .set('Authorization', `Bearer ${a.token}`);
      const inexistente = '0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f';

      // Act
      const ajena = await invalidar(citaB.id).expect(404);
      const noExiste = await invalidar(inexistente).expect(404);

      // Assert — el mismo cuerpo salvo el id pedido; nada del tenant ajeno
      expect(ajena.text.split(citaB.id).join('<id>')).toBe(
        noExiste.text.split(inexistente).join('<id>'),
      );
      expect(ajena.text).not.toContain(b.tenantId);
      await ver(tokenB).expect(200);
      const [{ activos }] = await datos.query<{ activos: number }[]>(
        `SELECT count(*)::int AS activos FROM enlaces_cita
          WHERE cita_id = $1 AND revocado_en IS NULL`,
        [citaB.id],
      );
      expect(activos).toBe(1);
    });

    it('invalidar → el enlace anterior da 404; el siguiente (versión 2) resuelve con otro token', async () => {
      // Arrange
      const cita = await crearCita(a);
      const v1 = await tokenDe(cita, a);
      const usuario = await usuarioDe(a);

      // Act
      await request(server())
        .post(`/api/citas/${cita.id}/enlace/invalidar`)
        .set('Authorization', `Bearer ${a.token}`)
        .expect(204);
      const v2 = await tokenDe(cita, a); // el próximo recordatorio

      // Assert
      expect(v2).not.toBe(v1);
      expect((await ver(v1).expect(404)).body).toEqual(CUERPO_404);
      expect((await ver(v2).expect(200)).body).toMatchObject({
        estado: 'pendiente',
        accionesPermitidas: ['confirmar', 'cancelar', 'pedirOtraHora'],
      });
      const filas = await datos.query<
        {
          version: number;
          revocado: boolean;
          motivo: string | null;
          revocadoPor: string | null;
        }[]
      >(
        `SELECT version, revocado_en IS NOT NULL AS revocado,
                motivo_revocacion AS motivo, revocado_por::text AS "revocadoPor"
           FROM enlaces_cita WHERE cita_id = $1 ORDER BY version`,
        [cita.id],
      );
      expect(filas).toEqual([
        {
          version: 1,
          revocado: true,
          motivo: 'invalidado',
          revocadoPor: usuario,
        },
        { version: 2, revocado: false, motivo: null, revocadoPor: null },
      ]);
      // En la base solo el hash: ninguna columna guarda el token
      const crudo = JSON.stringify(
        await datos.query('SELECT * FROM enlaces_cita WHERE cita_id = $1', [
          cita.id,
        ]),
      );
      expect(crudo).not.toContain(v1);
      expect(crudo).not.toContain(v2);
      expect(crudo).toContain(createHash('sha256').update(v2).digest('hex'));
    });
  });

  // ---------------------------------------------------------------------------
  describe('bitácora y voucher: quién confirmó y quién canceló (G3)', () => {
    it('cancelar desde el enlace → bitácora con actor paciente (id del enlace), CitaCancelada con ese actor y canceladaPor = paciente', async () => {
      // Arrange
      const cita = await crearCita(a);
      const token = await tokenDe(cita, a);
      const enlaceId = await enlaceActivoDe(cita);
      const duenio = await usuarioDe(a);

      // Act
      const res = await post('cancelar', token, { motivo: 'viaje' }).expect(
        200,
      );

      // Assert — respuesta pública
      exigirCabecerasPublicas(res);
      expect(res.body).toMatchObject({
        estado: 'cancelada',
        accionesPermitidas: [],
      });
      // Bitácora
      expect((await bitacoraDe(cita)).at(-1)).toEqual({
        tipo: 'cancelada',
        actorTipo: 'paciente',
        actorId: enlaceId,
        estadoAnterior: 'pendiente',
        estadoNuevo: 'cancelada',
      });
      // US-07.01 (H3): lo que cancela el paciente por su enlace queda como
      // pedido por el paciente, sin preguntar.
      expect(await pedidoPorDe(cita, 'cancelada')).toEqual(['paciente']);
      // Outbox: actor paciente, usuarioId = el DUEÑO de la cita
      const cancelada = (await hechosDe(cita)).find(
        (h) => h.nombre === 'CitaCancelada',
      );
      expect(cancelada?.payload).toMatchObject({
        citaId: cita.id,
        usuarioId: duenio,
        estado: 'cancelada',
        actor: { tipo: 'paciente', id: enlaceId },
      });
      // Voucher
      const voucher = await detalle(cita);
      expect(voucher).toMatchObject({
        estado: 'cancelada',
        canceladaPor: 'paciente',
        confirmadaPor: null,
      });
    });

    it('tras reagendar desde el voucher, la confirmación del paciente deja de contar; el MISMO enlace sirve y una nueva confirmación del profesional sí cuenta', async () => {
      // Arrange — el paciente confirma
      const cita = await crearCita(a);
      const token = await tokenDe(cita, a);
      await post('confirmar', token).expect(200);
      expect((await detalle(cita)).confirmadaPor).toBe('paciente');
      const nuevaHora = alMinuto(Date.now() + 9 * DIA);

      // Act — el profesional la mueve
      await desdeVoucher(cita, 'reagendar', {
        inicio: nuevaHora.toISOString(),
      }).expect(200);

      // Assert — vuelve a pendiente y la confirmación vieja ya no cuenta
      expect(await detalle(cita)).toMatchObject({
        estado: 'pendiente',
        inicio: nuevaHora.toISOString(),
        confirmadaPor: null,
        canceladaPor: null,
      });
      expect((await ver(token).expect(200)).body).toMatchObject({
        inicio: nuevaHora.toISOString(),
        estado: 'pendiente',
        accionesPermitidas: ['confirmar', 'cancelar', 'pedirOtraHora'],
      });

      // Act — ahora confirma el profesional
      await desdeVoucher(cita, 'confirmar').expect(200);

      // Assert
      expect((await detalle(cita)).confirmadaPor).toBe('profesional');
      expect((await bitacoraDe(cita)).map((c) => c.actorTipo)).toEqual([
        'profesional', // creada
        'paciente', // confirmada
        'profesional', // reagendada
        'profesional', // confirmada
      ]);
    });
  });

  // ---------------------------------------------------------------------------
  describe('aceptar una petición de otra hora (R2): bitácora, outbox y cita terminal', () => {
    it('desde una cita CONFIRMADA por el paciente: mueve la MISMA cita, vuelve a pendiente, bitácora reagendada del profesional y CitaReagendada en el outbox', async () => {
      // Arrange — el paciente confirma y después pide otra hora
      const cita = await crearCita(a);
      const token = await tokenDe(cita, a);
      const enlaceId = await enlaceActivoDe(cita);
      const profesional = await usuarioDe(a);
      await post('confirmar', token).expect(200);
      await post('otra-hora', token, { preferencia: 'sábado' }).expect(201);
      const [peticion] = await solicitudesDe(cita, 'recibida');
      const nuevaHora = alMinuto(Date.now() + 10 * DIA);

      // Act — solo fecha y hora
      const res = await request(server())
        .post(`/api/solicitudes/${peticion.id}/aceptar`)
        .set('Authorization', `Bearer ${a.token}`)
        .send({ inicio: nuevaHora.toISOString() })
        .expect(201);

      // Assert — la MISMA cita, movida y de vuelta a pendiente
      const body = res.body as AceptadaBody;
      expect(body.cita).toMatchObject({
        id: cita.id,
        estado: 'pendiente',
        inicio: nuevaHora.toISOString(),
      });
      expect(await detalle(cita)).toMatchObject({
        estado: 'pendiente',
        inicio: nuevaHora.toISOString(),
        confirmadaPor: null,
      });
      // Bitácora: reagendada por el profesional, desde confirmada
      expect((await bitacoraDe(cita)).at(-1)).toEqual({
        tipo: 'reagendada',
        actorTipo: 'profesional',
        actorId: profesional,
        estadoAnterior: 'confirmada',
        estadoNuevo: 'pendiente',
      });
      // US-07.01 (H3): la hizo el profesional, pero la pidió el paciente
      expect(await pedidoPorDe(cita, 'reagendada')).toEqual(['paciente']);
      // Outbox: CitaReagendada (los recordatorios se reprograman) y la aceptación
      const hechos = await hechosDe(cita);
      expect(
        hechos.find((h) => h.nombre === 'CitaReagendada')?.payload,
      ).toEqual({
        citaId: cita.id,
        pacienteId: expect.any(String) as unknown,
        usuarioId: profesional,
        estado: 'pendiente',
        inicio: nuevaHora.toISOString(),
        inicioAnterior: cita.inicio,
        actor: { tipo: 'profesional', id: profesional },
      });
      expect(
        hechos.find((h) => h.nombre === 'SolicitudCitaAceptada')?.payload,
      ).toEqual({
        solicitudId: peticion.id,
        citaId: cita.id,
        usuarioId: profesional,
      });
      // La petición quedó aceptada sobre la cita de origen, con su enlace
      const [fila] = await datos.query<
        {
          estado: string;
          citaId: string;
          enlaceId: string;
          usuarioId: string;
        }[]
      >(
        `SELECT estado::text AS estado, cita_id::text AS "citaId",
                enlace_id::text AS "enlaceId", usuario_id::text AS "usuarioId"
           FROM solicitudes_cita WHERE id = $1`,
        [peticion.id],
      );
      expect(fila).toEqual({
        estado: 'aceptada',
        citaId: cita.id,
        enlaceId,
        usuarioId: profesional,
      });
      // El mismo enlace sirve para la hora nueva
      expect((await ver(token).expect(200)).body).toMatchObject({
        inicio: nuevaHora.toISOString(),
        accionesPermitidas: ['confirmar', 'cancelar', 'pedirOtraHora'],
      });
    });

    it('con la cita de origen ya cancelada desde el voucher (antes del despacho) → 409 sin resolver la petición ni mover la cita; el despacho la descarta', async () => {
      // Arrange
      const cita = await crearCita(a);
      const token = await tokenDe(cita, a);
      await post('otra-hora', token, { preferencia: 'domingo' }).expect(201);
      const [peticion] = await solicitudesDe(cita, 'recibida');
      await desdeVoucher(cita, 'cancelar').expect(200);

      // Act
      await request(server())
        .post(`/api/solicitudes/${peticion.id}/aceptar`)
        .set('Authorization', `Bearer ${a.token}`)
        .send({ inicio: alMinuto(Date.now() + 11 * DIA).toISOString() })
        .expect(409);

      // Assert — nada cambió
      expect(await detalle(cita)).toMatchObject({
        estado: 'cancelada',
        inicio: cita.inicio,
      });
      expect(
        (await hechosDe(cita)).some((h) => h.nombre === 'CitaReagendada'),
      ).toBe(false);
      expect(await solicitudesDe(cita, 'recibida')).toHaveLength(1);

      // Act — el suscriptor recibe CitaCancelada
      await despacharOutbox();

      // Assert
      expect(await solicitudesDe(cita, 'recibida')).toEqual([]);
      expect(await solicitudesDe(cita, 'descartada')).toHaveLength(1);
    });
  });

  // ---------------------------------------------------------------------------
  describe('suscriptor con el outbox real: la petición abierta y la cita que termina', () => {
    it.each<[string, string, boolean, string]>([
      ['cancelar desde el voucher', 'cancelar', false, 'CitaCancelada'],
      ['marcar asistencia', 'asistencia', true, 'CitaAsistida'],
      ['marcar inasistencia', 'inasistencia', true, 'CitaNoAsistida'],
    ])(
      '%s → la petición queda descartada; repetir el hecho no cambia nada (idempotente)',
      async (_caso, accion, marca, hecho) => {
        // Arrange — petición abierta (sobre una cita confirmada si hace falta)
        const cita = await crearCita(a);
        const token = await tokenDe(cita, a);
        if (marca) await post('confirmar', token).expect(200);
        await post('otra-hora', token, {
          preferencia: 'cuando se pueda',
        }).expect(201);
        if (marca) {
          // US-07.01 (H2): asistencia e inasistencia solo desde la hora de
          // inicio. El paciente ya actuó (antes del inicio); ahora llega la hora.
          await datos.query(
            `UPDATE citas SET inicio = now() - interval '1 hour' WHERE id = $1`,
            [cita.id],
          );
        }

        // Act
        await desdeVoucher(cita, accion).expect(200);
        await despacharOutbox();

        // Assert
        expect(await solicitudesDe(cita, 'recibida')).toEqual([]);
        const descartadas = await solicitudesDe(cita, 'descartada');
        expect(descartadas).toHaveLength(1);
        expect(descartadas[0]).toMatchObject({
          tipo: 'reagendamiento',
          citaOrigenId: cita.id,
          citaId: null,
        });
        expect(descartadas[0].resueltaEn).not.toBeNull();

        // Act — el outbox entrega el MISMO hecho otra vez (al menos una vez)
        await datos.query(
          `INSERT INTO eventos_salida (nombre, tenant_id, payload, ocurrido_en)
           SELECT nombre, tenant_id, payload, ocurrido_en
             FROM eventos_salida
            WHERE nombre = $1 AND payload->>'citaId' = $2`,
          [hecho, cita.id],
        );
        expect(
          (await hechosDe(cita)).filter((h) => h.nombre === hecho),
        ).toHaveLength(2);
        await despacharOutbox();

        // Assert — nada cambió y el hecho repetido se entregó sin error
        expect(await solicitudesDe(cita, 'descartada')).toEqual(descartadas);
        expect(await solicitudesDe(cita, 'recibida')).toEqual([]);
        expect(await hechosConProblemas(cita)).toBe(0);
      },
    );

    it('reagendar desde el voucher NO atiende una petición recibida DESPUÉS del reagendamiento (la decide la bandeja)', async () => {
      // Arrange — el profesional mueve la cita y, antes del despacho, el
      // paciente pide otra hora (ya para la hora nueva)
      const cita = await crearCita(a);
      const token = await tokenDe(cita, a);
      await desdeVoucher(cita, 'reagendar', {
        inicio: alMinuto(Date.now() + 12 * DIA).toISOString(),
      }).expect(200);
      await post('otra-hora', token, { preferencia: 'lunes' }).expect(201);
      // Sin depender de la diferencia de relojes app/BD: la petición queda
      // 1 s DESPUÉS del hecho CitaReagendada.
      await datos.query(
        `UPDATE solicitudes_cita
            SET recibida_en = (SELECT ocurrido_en + interval '1 second'
                                 FROM eventos_salida
                                WHERE nombre = 'CitaReagendada'
                                  AND payload->>'citaId' = $1::text)
          WHERE cita_origen_id = $1::uuid`,
        [cita.id],
      );

      // Act
      await despacharOutbox();

      // Assert
      expect(await solicitudesDe(cita, 'recibida')).toHaveLength(1);
      expect(await solicitudesDe(cita, 'aceptada')).toEqual([]);
      expect(await hechosConProblemas(cita)).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  describe('regla anti-spam por RUT: ignora los reagendamientos en los dos sentidos (R5)', () => {
    let c: Organizacion;

    beforeAll(async () => {
      // Organización propia: su bandeja solo tiene lo de estos tests.
      c = await registrar('c');
    }, 30_000);

    const solicitudPublica = (rut: string) =>
      request(server())
        .post(`/api/publico/${c.tenantSlug}/solicitudes`)
        .send({
          rut,
          nombrePaciente: 'Paciente Spam',
          telefono: '+56 9 1111 2222',
          correo: 'spam@correo.cl',
          motivo: 'Control',
          preferenciaHoraria: 'mañanas',
          consentimiento: true,
        })
        .expect(202);

    const recibidasDe = async (
      rut: string,
      tipo: string,
    ): Promise<SolicitudBody[]> =>
      (
        (
          await request(server())
            .get('/api/solicitudes?estado=recibida')
            .set('Authorization', `Bearer ${c.token}`)
            .expect(200)
        ).body as SolicitudBody[]
      ).filter(
        (s) => s.tipo === tipo && rutCanonico(s.rut) === rutCanonico(rut),
      );

    it('con una petición de otra hora abierta, el mismo RUT puede enviar una solicitud nueva por la vía pública (y la regla sigue viva para las nuevas)', async () => {
      // Arrange — la petición de otra hora copia el RUT de la ficha
      const rut = rutValido(15_678_901);
      const cita = await crearCita(c, undefined, rut);
      const token = await tokenDe(cita, c);
      await post('otra-hora', token, { preferencia: 'tardes' }).expect(201);
      expect(await recibidasDe(rut, 'reagendamiento')).toHaveLength(1);

      // Act
      await solicitudPublica(rut);

      // Assert
      expect(await recibidasDe(rut, 'nueva')).toHaveLength(1);
      // Una segunda NUEVA del mismo RUT sí choca con la regla (se descarta en silencio)
      await solicitudPublica(rut);
      expect(await recibidasDe(rut, 'nueva')).toHaveLength(1);
      expect(await recibidasDe(rut, 'reagendamiento')).toHaveLength(1);
    });

    it('con una solicitud nueva abierta del mismo RUT, el paciente puede pedir otra hora para su cita', async () => {
      // Arrange
      const rut = rutValido(16_789_012);
      await solicitudPublica(rut);
      expect(await recibidasDe(rut, 'nueva')).toHaveLength(1);
      const cita = await crearCita(c, undefined, rut);
      const token = await tokenDe(cita, c);

      // Act
      const res = await post('otra-hora', token, {
        preferencia: 'mañanas',
      }).expect(201);

      // Assert
      expect((res.body as VistaBody).accionesPermitidas).toEqual(['cancelar']);
      expect(await recibidasDe(rut, 'reagendamiento')).toHaveLength(1);
      expect(await recibidasDe(rut, 'nueva')).toHaveLength(1);
    });
  });

  // ---------------------------------------------------------------------------
  describe('carrera real: dos peticiones de otra hora para la misma cita (R5)', () => {
    it('la que llega segunda recibe 409 (23505 traducido), sin 500', async () => {
      // Arrange — otra conexión inserta una petición SIN confirmar
      const cita = await crearCita(a);
      const token = await tokenDe(cita, a);
      const otra = datos.createQueryRunner();
      await otra.connect();
      await otra.startTransaction();
      try {
        await otra.query(
          `INSERT INTO solicitudes_cita
             (tenant_id, nombre_paciente, telefono, motivo, preferencia_horaria,
              tipo, cita_origen_id)
           VALUES ($1, 'Otra', '+56 9 0', '', 'cuando sea', 'reagendamiento', $2)`,
          [a.tenantId, cita.id],
        );

        // Act — el portal no la ve (no confirmada) e intenta insertar: queda
        // esperando el índice único hasta que la otra confirme.
        const enCurso = post('otra-hora', token, { preferencia: 'yo' }).then(
          (res) => res,
        );
        await esperarBloqueo(datos);
        await otra.commitTransaction();
        const res = await enCurso;

        // Assert
        expect(res.status).toBe(409);
        expect(res.body).toEqual(CUERPO_409);
        expect(await solicitudesDe(cita, 'recibida')).toHaveLength(1);
      } finally {
        if (otra.isTransactionActive) await otra.rollbackTransaction();
        await otra.release();
      }
    });
  });
});

/** Espera a que alguna conexión de la base de test quede esperando un candado. */
async function esperarBloqueo(datos: DataSource): Promise<void> {
  const limite = Date.now() + 5_000;
  for (;;) {
    const [{ n }] = await datos.query<{ n: number }[]>(
      `SELECT count(*)::int AS n
         FROM pg_locks l
         JOIN pg_stat_activity s ON s.pid = l.pid
        WHERE NOT l.granted
          AND s.datname = current_database()`,
    );
    if (n >= 1) return;
    if (Date.now() > limite) {
      throw new Error('se esperaba una conexión bloqueada');
    }
    await new Promise((resolver) => setTimeout(resolver, 20));
  }
}
