import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';

import { JwtAuthGuard } from '../src/modules/auth/jwt-auth.guard';
import { JwtPayload } from '../src/modules/auth/jwt-payload.interface';
import { JwtStrategy } from '../src/modules/auth/jwt.strategy';
import { CitasService } from '../src/modules/cita/application/citas.service';
import { EnlacesCitaService } from '../src/modules/cita/application/enlaces-cita.service';
import {
  CambioCita,
  TipoCambio,
} from '../src/modules/cita/domain/cambio-cita.entity';
import {
  CambioCitaRepository,
  UltimoCambio,
} from '../src/modules/cita/domain/cambio-cita.repository';
import {
  Cita,
  EstadoCita,
  OrigenCita,
} from '../src/modules/cita/domain/cita.entity';
import { CitaRepository } from '../src/modules/cita/domain/cita.repository';
import { CitasController } from '../src/modules/cita/presentation/citas.controller';
import { PacientesService } from '../src/modules/paciente/application/pacientes.service';
import { Paciente } from '../src/modules/paciente/domain/paciente.entity';
import { PacienteRepository } from '../src/modules/paciente/domain/paciente.repository';
import { RolUsuario } from '../src/modules/usuario/domain/usuario.entity';
import { rangoDelDiaEnZona } from '../src/shared/domain/timezone';
import { DerivadorTokenEnlaceDePrueba } from './support/derivador-token-enlace-de-prueba';
import { InMemoryEnlaceCitaRepository } from './support/in-memory-repositories';

/**
 * E2E de GET /api/citas/:id (US-02.08) SIN base de datos.
 *
 * El resto de suites e2e necesitan Postgres y hoy no corren en ningun entorno
 * (DT-20). Esta monta la pila HTTP real —prefijo `api`, ValidationPipe global,
 * JwtAuthGuard con passport-jwt y JwtStrategy reales, ParseUUIDPipe,
 * CitasController y CitasService reales— y sustituye SOLO la persistencia por
 * repositorios en memoria que respetan el contrato del puerto (filtran por
 * tenant). Asi se observa el comportamiento HTTP (401/400/404/200, orden de
 * rutas) sin levantar infraestructura.
 *
 * Lo que NO cubre (sigue siendo DT-20): el filtro por tenant del adaptador
 * TypeORM real, fronteras del dia en SQL, indices.
 */

// JwtStrategy lee el secreto via ConfigService.getOrThrow. El firmante de abajo
// lee del MISMO ConfigService, asi que no importa si el .env define otro.
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret-e2e';

const TZ = 'America/Santiago';

const TENANT_A = 'tenant-a';
const TENANT_B = 'tenant-b';
const USUARIO_A = 'usuario-a';
const USUARIO_B = 'usuario-b';

const CITA_A = '11111111-1111-4111-8111-111111111111';
const CITA_B = '22222222-2222-4222-8222-222222222222';
const PACIENTE_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PACIENTE_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

// --- Dobles de persistencia (contrato del puerto, sin BD) --------------------

class InMemoryCitaRepository extends CitaRepository {
  readonly citas = new Map<string, Cita>();

  guardar(cita: Cita): Promise<Cita> {
    this.citas.set(cita.id, cita);
    return Promise.resolve(cita);
  }

  // Igual que el adaptador real: una cita de otro tenant es invisible.
  buscarPorId(id: string, tenantId: string): Promise<Cita | null> {
    const cita = this.citas.get(id);
    return Promise.resolve(cita && cita.tenantId === tenantId ? cita : null);
  }

  buscarPorIdParaActualizar(
    id: string,
    tenantId: string,
  ): Promise<Cita | null> {
    return this.buscarPorId(id, tenantId);
  }

  buscarPorIds(ids: readonly string[], tenantId: string): Promise<Cita[]> {
    return Promise.resolve(
      [...this.citas.values()].filter(
        (c) => ids.includes(c.id) && c.tenantId === tenantId,
      ),
    );
  }

  buscarDelDiaPorProfesional(
    tenantId: string,
    usuarioId: string,
    dia: Date,
  ): Promise<Cita[]> {
    const { desde, hasta } = rangoDelDiaEnZona(dia, TZ);
    return Promise.resolve(
      [...this.citas.values()]
        .filter(
          (c) =>
            c.tenantId === tenantId &&
            c.usuarioId === usuarioId &&
            c.inicio >= desde &&
            c.inicio < hasta,
        )
        .sort((a, b) => a.inicio.getTime() - b.inicio.getTime()),
    );
  }

  buscarPorProfesionalEnRango(
    tenantId: string,
    usuarioId: string,
    desde: Date,
    hasta: Date,
    opciones?: { estados?: readonly EstadoCita[] },
  ): Promise<Cita[]> {
    return Promise.resolve(
      [...this.citas.values()]
        .filter(
          (c) =>
            c.tenantId === tenantId &&
            c.usuarioId === usuarioId &&
            c.inicio >= desde &&
            c.inicio < hasta &&
            (opciones?.estados === undefined ||
              opciones.estados.includes(c.estado)),
        )
        .sort(
          (a, b) =>
            a.inicio.getTime() - b.inicio.getTime() ||
            a.creadoEn.getTime() - b.creadoEn.getTime(),
        ),
    );
  }
}

class InMemoryCambioCitaRepository extends CambioCitaRepository {
  readonly cambios: CambioCita[] = [];
  private ultimoInstante = 0;

  // Como la BD, pone `ocurridoEn` si no viene; reloj estrictamente creciente
  // para que el orden de inserción sea también el cronológico.
  registrar(cambio: CambioCita): Promise<CambioCita> {
    if (cambio.ocurridoEn === undefined) {
      this.ultimoInstante = Math.max(Date.now(), this.ultimoInstante + 1);
      cambio.ocurridoEn = new Date(this.ultimoInstante);
    }
    this.cambios.push(cambio);
    return Promise.resolve(cambio);
  }

  historialDeCita(citaId: string, tenantId: string): Promise<CambioCita[]> {
    return Promise.resolve(
      this.cambios.filter(
        (c) => c.citaId === citaId && c.tenantId === tenantId,
      ),
    );
  }

  // Gana el `ocurridoEn` más reciente de cada tipo (a igual instante, el
  // último insertado).
  ultimosCambiosPorTipo(
    citaId: string,
    tenantId: string,
    tipos: readonly TipoCambio[],
  ): Promise<Partial<Record<TipoCambio, UltimoCambio>>> {
    const resultado: Partial<Record<TipoCambio, UltimoCambio>> = {};
    for (const c of this.cambios) {
      if (
        c.citaId !== citaId ||
        c.tenantId !== tenantId ||
        !tipos.includes(c.tipo)
      ) {
        continue;
      }
      const actual = resultado[c.tipo];
      if (!actual || c.ocurridoEn.getTime() >= actual.ocurridoEn.getTime()) {
        resultado[c.tipo] = { actor: c.actorTipo, ocurridoEn: c.ocurridoEn };
      }
    }
    return Promise.resolve(resultado);
  }
}

class InMemoryPacienteRepository extends PacienteRepository {
  readonly pacientes = new Map<string, Paciente>();

  guardar(paciente: Partial<Paciente>): Promise<Paciente> {
    const p = paciente as Paciente;
    this.pacientes.set(p.id, p);
    return Promise.resolve(p);
  }

  buscarPorId(id: string, tenantId: string): Promise<Paciente | null> {
    const p = this.pacientes.get(id);
    return Promise.resolve(p && p.tenantId === tenantId ? p : null);
  }

  buscarPorRut(rut: string, tenantId: string): Promise<Paciente | null> {
    const p = [...this.pacientes.values()].find(
      (x) => x.rut === rut && x.tenantId === tenantId,
    );
    return Promise.resolve(p ?? null);
  }

  buscarPorIds(ids: readonly string[], tenantId: string): Promise<Paciente[]> {
    return Promise.resolve(
      [...this.pacientes.values()].filter(
        (x) => ids.includes(x.id) && x.tenantId === tenantId,
      ),
    );
  }

  // Este suite no edita pacientes: basta con cumplir el puerto.
  actualizarContacto(): Promise<boolean> {
    return Promise.resolve(false);
  }

  completarCorreoSiVacio(): Promise<boolean> {
    return Promise.resolve(false);
  }
}

// --- Formas de respuesta -----------------------------------------------------

interface DetalleBody {
  id: string;
  estado: string;
  inicio: string;
  hora: string;
  duracionMin: number;
  tipoConsulta: string;
  paciente: Record<string, unknown>;
  accionesPermitidas: string[];
  confirmadaPor: string | null;
  canceladaPor: string | null;
}

interface DashboardItem {
  id: string;
  pacienteNombre: string;
  hora: string;
}

describe('GET /api/citas/:id — voucher (e2e sin BD, US-02.08)', () => {
  let app: INestApplication;
  let jwt: JwtService;
  const citaRepo = new InMemoryCitaRepository();
  const cambioRepo = new InMemoryCambioCitaRepository();
  const pacienteRepo = new InMemoryPacienteRepository();
  // Enlace del paciente (Fase 3): solo para la ruta de invalidar.
  const enlaceRepo = new InMemoryEnlaceCitaRepository();
  const derivador = new DerivadorTokenEnlaceDePrueba();
  // El doble de enlaces exige un contexto de transacción (como el real).
  const txEnlaces = { e2e: 'tx' };

  let tokenA: string;
  let tokenB: string;

  const server = (): App => app.getHttpServer() as App;

  const firmar = (sub: string, tenantId: string): Promise<string> =>
    jwt.signAsync({
      sub,
      email: `${sub}@demo.com`,
      tenantId,
      rol: RolUsuario.PROFESIONAL,
    } satisfies JwtPayload);

  const cita = (
    id: string,
    tenantId: string,
    pacienteId: string,
    usuarioId: string,
    estado: EstadoCita,
    inicio: Date,
  ): Cita =>
    Cita.reconstituir({
      id,
      inicio,
      duracionMin: 45,
      tipoConsulta: 'Control',
      estado,
      tenantId,
      pacienteId,
      usuarioId,
      origen: OrigenCita.MANUAL,
      creadoEn: new Date(),
      actualizadoEn: new Date(),
    });

  // Semilla fresca por test: el flujo de reagendar muta la cita en memoria.
  const sembrar = (): void => {
    citaRepo.citas.clear();
    cambioRepo.cambios.length = 0;
    pacienteRepo.pacientes.clear();
    enlaceRepo.enlaces.clear();

    pacienteRepo.pacientes.set(PACIENTE_A, {
      id: PACIENTE_A,
      rut: '123456785', // canonico, como vive en BD
      nombre: 'Ana Pérez',
      telefono: '+56 9 1111 1111',
      correo: 'ana@mail.com',
      consentimiento: true,
      tenantId: TENANT_A,
    });
    pacienteRepo.pacientes.set(PACIENTE_B, {
      id: PACIENTE_B,
      rut: '111111111',
      nombre: 'Beto Soto',
      telefono: '+56 9 2222 2222',
      correo: null,
      consentimiento: true,
      tenantId: TENANT_B,
    });

    // Cita de A para "ahora": sirve al detalle y aparece en GET /hoy.
    citaRepo.citas.set(
      CITA_A,
      cita(
        CITA_A,
        TENANT_A,
        PACIENTE_A,
        USUARIO_A,
        EstadoCita.CONFIRMADA,
        new Date(),
      ),
    );
    citaRepo.citas.set(
      CITA_B,
      cita(
        CITA_B,
        TENANT_B,
        PACIENTE_B,
        USUARIO_B,
        EstadoCita.PENDIENTE,
        new Date('2026-09-25T18:05:00Z'),
      ),
    );
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
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
      controllers: [CitasController],
      providers: [
        JwtStrategy,
        JwtAuthGuard,
        {
          provide: CitasService,
          useFactory: () =>
            new CitasService(
              citaRepo,
              cambioRepo,
              pacienteRepo,
              // Solo lo usa crearCita, que esta suite no ejercita.
              {} as PacientesService,
              { run: (work) => work(undefined) },
              { publicar: () => Promise.resolve() },
              TZ,
            ),
        },
        {
          provide: EnlacesCitaService,
          useFactory: () =>
            new EnlacesCitaService(enlaceRepo, citaRepo, derivador, {
              run: (work) => work(txEnlaces),
            }),
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    // Igual que src/main.ts.
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();

    jwt = moduleFixture.get(JwtService);
    tokenA = await firmar(USUARIO_A, TENANT_A);
    tokenB = await firmar(USUARIO_B, TENANT_B);
  });

  beforeEach(() => {
    sembrar();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('autenticación (JwtAuthGuard real)', () => {
    it('debería responder 401 cuando no se envía token', async () => {
      await request(server()).get(`/api/citas/${CITA_A}`).expect(401);
    });

    it('debería responder 401 cuando el token está firmado con otro secreto', async () => {
      // Arrange
      const falso = await jwt.signAsync(
        { sub: USUARIO_A, tenantId: TENANT_A },
        { secret: 'otro-secreto' },
      );

      // Act & Assert
      await request(server())
        .get(`/api/citas/${CITA_A}`)
        .set('Authorization', `Bearer ${falso}`)
        .expect(401);
    });

    it('debería responder 401 antes de validar el id cuando no hay token y el id no es UUID', async () => {
      // El guard corre antes que los pipes: sin credenciales no se informa
      // nada sobre el formato del recurso.
      await request(server()).get('/api/citas/no-es-uuid').expect(401);
    });
  });

  describe('validación del id', () => {
    it('debería responder 400 cuando el id no es un UUID', async () => {
      const res = await request(server())
        .get('/api/citas/no-es-uuid')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(400);

      expect(res.body).toMatchObject({ statusCode: 400 });
    });
  });

  describe('respuesta 200', () => {
    it('debería devolver cita + paciente + acciones en una sola llamada', async () => {
      // Act
      const res = await request(server())
        .get(`/api/citas/${CITA_A}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      // Assert
      const body = res.body as DetalleBody;
      expect(body.id).toBe(CITA_A);
      expect(body.estado).toBe('confirmada');
      expect(body.hora).toMatch(/^\d{2}:\d{2}$/);
      expect(body.duracionMin).toBe(45);
      expect(body.tipoConsulta).toBe('Control');
      expect(body.paciente).toEqual({
        id: PACIENTE_A,
        nombre: 'Ana Pérez',
        rut: '12.345.678-5',
        telefono: '+56 9 1111 1111',
        correo: 'ana@mail.com',
      });
      expect(body.accionesPermitidas).toEqual([
        'cancelar',
        'reagendar',
        'asistencia',
        'inasistencia',
        'editar',
      ]);
    });

    it('no debería exponer tenantId, usuarioId, consentimiento ni el RUT canónico', async () => {
      // Act
      const res = await request(server())
        .get(`/api/citas/${CITA_A}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      // Assert sobre el texto crudo: lo que de verdad viaja por la red.
      expect(res.text).not.toMatch(/tenantId|usuarioId|consentimiento/);
      expect(res.text).not.toContain(TENANT_A);
      expect(res.text).not.toContain(USUARIO_A);
      expect(res.text).not.toContain('123456785');
      expect(res.text).not.toContain('ghosting');
    });
  });

  describe('aislamiento por tenant', () => {
    it('debería responder 404 con cuerpo idéntico para una cita de otro tenant y una inexistente', async () => {
      // Arrange: la cita existe de verdad para su dueño.
      await request(server())
        .get(`/api/citas/${CITA_B}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(200);

      // Act 1: A pide la cita de B (existe, pero en otro tenant).
      const otroTenant = await request(server())
        .get(`/api/citas/${CITA_B}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(404);

      // Act 2: la misma URL cuando la cita ya no existe en ningun tenant.
      citaRepo.citas.delete(CITA_B);
      const inexistente = await request(server())
        .get(`/api/citas/${CITA_B}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(404);

      // Assert: indistinguibles. Nada revela que la cita vive en otro lado.
      expect(otroTenant.body).toEqual(inexistente.body);
      expect(otroTenant.text).toBe(inexistente.text);
      expect(otroTenant.text).not.toContain(TENANT_B);
      expect(otroTenant.text).not.toContain('Beto');
    });
  });

  describe('orden de rutas', () => {
    it('debería resolver GET /api/citas/hoy al dashboard y no al detalle por id', async () => {
      // Act
      const res = await request(server())
        .get('/api/citas/hoy')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      // Assert: forma de dashboard (lista), no de voucher (objeto) ni un 400
      // del UUID pipe.
      expect(Array.isArray(res.body)).toBe(true);
      const items = res.body as DashboardItem[];
      expect(items.map((c) => c.id)).toEqual([CITA_A]);
      expect(items[0].pacienteNombre).toBe('Ana Pérez');
      expect(items[0]).not.toHaveProperty('accionesPermitidas');
    });
  });

  describe('flujo del voucher: acción y relectura', () => {
    it('debería mostrar las acciones de pendiente tras reagendar una cita confirmada', async () => {
      // Arrange
      const antes = await request(server())
        .get(`/api/citas/${CITA_A}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);
      expect((antes.body as DetalleBody).accionesPermitidas).toContain(
        'asistencia',
      );

      // Act: la ruta de escritura que ya existia (no se crea ninguna nueva).
      // A una hora FUTURA (diciembre: UTC-3 en Chile): desde US-07.01 una
      // pendiente cuya hora ya llegó también ofrece asistencia e inasistencia.
      await request(server())
        .patch(`/api/citas/${CITA_A}/reagendar`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ inicio: '2030-12-10T10:00:00-03:00' })
        .expect(200);

      // Assert: el frontend vuelve a pedir el detalle y ve el estado nuevo.
      const despues = await request(server())
        .get(`/api/citas/${CITA_A}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);
      const body = despues.body as DetalleBody;
      expect(body.estado).toBe('pendiente');
      expect(body.hora).toBe('10:00');
      expect(body.accionesPermitidas).toEqual([
        'confirmar',
        'cancelar',
        'reagendar',
        'editar',
      ]);
    });

    it('debería mostrar el voucher sin acciones tras cancelar', async () => {
      // Act
      await request(server())
        .patch(`/api/citas/${CITA_A}/cancelar`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ motivo: 'Paciente avisó' })
        .expect(200);

      // Assert
      const res = await request(server())
        .get(`/api/citas/${CITA_A}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);
      const body = res.body as DetalleBody;
      expect(body.estado).toBe('cancelada');
      expect(body.accionesPermitidas).toEqual([]);
    });
  });

  describe('Fase 3: quién confirmó / canceló (G3)', () => {
    it('debería traer confirmadaPor y canceladaPor (aditivo) y null cuando no hay cambio en la bitácora', async () => {
      // Act — la semilla no tiene bitácora
      const res = await request(server())
        .get(`/api/citas/${CITA_A}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      // Assert
      const body = res.body as DetalleBody;
      expect(body).toHaveProperty('confirmadaPor', null);
      expect(body).toHaveProperty('canceladaPor', null);
    });

    it('debería decir "profesional" tras cancelar desde el voucher', async () => {
      // Arrange
      await request(server())
        .patch(`/api/citas/${CITA_A}/cancelar`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({})
        .expect(200);

      // Act
      const res = await request(server())
        .get(`/api/citas/${CITA_A}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      // Assert
      const body = res.body as DetalleBody;
      expect(body.canceladaPor).toBe('profesional');
      expect(body.confirmadaPor).toBeNull();
    });

    it('tras reagendar, una confirmación anterior deja de contar (vuelve a pendiente)', async () => {
      // Arrange — confirmada por el profesional y luego movida
      citaRepo.citas.set(
        CITA_A,
        cita(
          CITA_A,
          TENANT_A,
          PACIENTE_A,
          USUARIO_A,
          EstadoCita.PENDIENTE,
          new Date('2026-09-29T13:00:00Z'),
        ),
      );
      await request(server())
        .patch(`/api/citas/${CITA_A}/confirmar`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);
      const confirmada = await request(server())
        .get(`/api/citas/${CITA_A}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);
      expect((confirmada.body as DetalleBody).confirmadaPor).toBe(
        'profesional',
      );

      // Act
      await request(server())
        .patch(`/api/citas/${CITA_A}/reagendar`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ inicio: '2026-09-30T10:00:00-03:00' })
        .expect(200);
      const res = await request(server())
        .get(`/api/citas/${CITA_A}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      // Assert
      expect((res.body as DetalleBody).estado).toBe('pendiente');
      expect((res.body as DetalleBody).confirmadaPor).toBeNull();
    });
  });

  describe('POST /api/citas/:id/enlace/invalidar (Fase 3, S1)', () => {
    const invalidar = (id: string, token?: string) => {
      const peticion = request(server()).post(
        `/api/citas/${id}/enlace/invalidar`,
      );
      return token
        ? peticion.set('Authorization', `Bearer ${token}`)
        : peticion;
    };

    const emitirEnlace = (citaId: string, tenantId: string) =>
      new EnlacesCitaService(enlaceRepo, citaRepo, derivador, {
        run: (work) => work(txEnlaces),
      }).asegurarActivo(citaId, tenantId, txEnlaces);

    it('401 sin token', async () => {
      await invalidar(CITA_A).expect(401);
    });

    it('400 si el id no es UUID', async () => {
      await invalidar('no-es-uuid', tokenA).expect(400);
    });

    it('204 sin cuerpo y el enlace activo queda revocado por el usuario del token', async () => {
      // Arrange
      await emitirEnlace(CITA_A, TENANT_A);

      // Act
      const res = await invalidar(CITA_A, tokenA).expect(204);

      // Assert
      expect(res.text).toBe('');
      const [enlace] = [...enlaceRepo.enlaces.values()];
      expect(enlace.estaActivo()).toBe(false);
      expect(enlace.revocadoPor).toBe(USUARIO_A);
    });

    it('204 también si la cita no tenía enlace activo (idempotente)', async () => {
      await invalidar(CITA_A, tokenA).expect(204);
      await invalidar(CITA_A, tokenA).expect(204);
      expect(enlaceRepo.enlaces.size).toBe(0);
    });

    it('404 idéntico para una cita de otro tenant y una inexistente; el enlace ajeno sigue activo', async () => {
      // Arrange — B tiene un enlace activo
      await emitirEnlace(CITA_B, TENANT_B);

      // Act
      const otroTenant = await invalidar(CITA_B, tokenA).expect(404);
      const inexistente = await invalidar(
        '33333333-3333-4333-8333-333333333333',
        tokenA,
      ).expect(404);

      // Assert
      expect(
        [...enlaceRepo.enlaces.values()].every((e) => e.estaActivo()),
      ).toBe(true);
      expect(otroTenant.text).not.toContain(TENANT_B);
      expect((otroTenant.body as { statusCode: number }).statusCode).toBe(
        (inexistente.body as { statusCode: number }).statusCode,
      );
    });
  });
});
