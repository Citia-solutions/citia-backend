import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource, Repository } from 'typeorm';

import { AuthModule } from '../src/modules/auth/auth.module';
import { CitaModule } from '../src/modules/cita/cita.module';
import { CambioCitaOrmEntity } from '../src/modules/cita/infrastructure/persistence/cambio-cita.orm-entity';
import { CitaOrmEntity } from '../src/modules/cita/infrastructure/persistence/cita.orm-entity';
import { PacienteModule } from '../src/modules/paciente/paciente.module';
import { PacienteOrmEntity } from '../src/modules/paciente/infrastructure/persistence/paciente.orm-entity';
import { TenantOrmEntity } from '../src/modules/tenant/infrastructure/persistence/tenant.orm-entity';
import { UsuariosModule } from '../src/modules/usuario/usuarios.module';
import { UsuarioOrmEntity } from '../src/modules/usuario/infrastructure/persistence/usuario.orm-entity';
import { EventoSalidaOrmEntity } from '../src/shared/infrastructure/salida/evento-salida.orm-entity';

process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret-e2e';
process.env.JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN ?? '1d';

const typeOrmPacientesTestConfig: TypeOrmModuleOptions = {
  type: 'postgres',
  host: process.env.TEST_DB_HOST ?? 'localhost',
  port: parseInt(process.env.TEST_DB_PORT ?? '5432'),
  username: process.env.TEST_DB_USER ?? 'postgres',
  password: process.env.TEST_DB_PASS ?? 'postgres',
  database: process.env.TEST_DB_NAME ?? 'citia_test',
  entities: [
    TenantOrmEntity,
    UsuarioOrmEntity,
    PacienteOrmEntity,
    CitaOrmEntity,
    CambioCitaOrmEntity,
    EventoSalidaOrmEntity,
  ],
  synchronize: true, // SOLO aquí: BD efímera de test, nunca dev/prod
  dropSchema: true,
};

interface RegistroBody {
  tenantSlug: string;
  tenantId: string;
}
interface LoginBody {
  accessToken: string;
}
interface PacienteBody {
  id: string;
  rut: string | null;
  nombre: string;
  telefono: string;
  correo: string | null;
  consentimiento: boolean;
  tenantId: string;
}
interface CitaBody {
  id: string;
  pacienteId: string;
  paciente: PacienteBody;
}
interface ErrorBody {
  statusCode: number;
  message: string | string[];
}

/**
 * E2E del correo obligatorio del paciente y de `PATCH /api/pacientes/:id`
 * (US-03 paso 13, ADR-13 §14).
 *
 * ⚠️ REQUIERE PostgreSQL real (vars TEST_DB_*) con synchronize/dropSchema:
 * prueba el UPDATE filtrado por tenant y el UPDATE condicional de "completar
 * si está vacío" contra SQL de verdad.
 */
describe('Pacientes: correo obligatorio y PATCH (e2e)', () => {
  let app: INestApplication;
  let pacientes: Repository<PacienteOrmEntity>;
  const server = (): App => app.getHttpServer() as App;

  const tenantA = {
    nombreTenant: 'Clinica Pacientes A',
    email: 'admin@pacientes-a.com',
    password: 'password1234',
    nombreCompleto: 'Admin A',
  };
  const tenantB = {
    nombreTenant: 'Clinica Pacientes B',
    email: 'admin@pacientes-b.com',
    password: 'password1234',
    nombreCompleto: 'Admin B',
  };

  let tokenA: string;
  let tokenB: string;
  let tenantAId: string;

  const sinCorreo = {
    nombre: 'Ana Soto',
    telefono: '+56 9 1111 1111',
    consentimiento: true,
  };
  const pacienteValido = { ...sinCorreo, correo: 'ana@mail.com' };

  // Mañana: no depende de la hora a la que corra el test.
  let horaSiguiente = 8;
  const inicioManana = (): string => {
    const d = new Date(Date.now() + 86_400_000);
    d.setUTCHours(horaSiguiente++, 0, 0, 0);
    return d.toISOString();
  };

  const registrar = async (
    cred: typeof tenantA,
  ): Promise<{ slug: string; tenantId: string }> => {
    const res = await request(server())
      .post('/api/usuarios')
      .send(cred)
      .expect(201);
    const body = res.body as RegistroBody;
    return { slug: body.tenantSlug, tenantId: body.tenantId };
  };

  const login = async (slug: string, cred: typeof tenantA): Promise<string> => {
    const res = await request(server())
      .post('/api/auth/login')
      .send({ tenantSlug: slug, email: cred.email, password: cred.password })
      .expect(200);
    return (res.body as LoginBody).accessToken;
  };

  const crearPaciente = async (
    token: string,
    body: Record<string, unknown> = pacienteValido,
  ): Promise<PacienteBody> => {
    const res = await request(server())
      .post('/api/pacientes')
      .set('Authorization', `Bearer ${token}`)
      .send(body)
      .expect(201);
    return res.body as PacienteBody;
  };

  const patch = (token: string, id: string, body: unknown) =>
    request(server())
      .patch(`/api/pacientes/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send(body as object);

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        TypeOrmModule.forRoot(typeOrmPacientesTestConfig),
        UsuariosModule,
        AuthModule,
        PacienteModule,
        CitaModule,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();

    pacientes = app.get(DataSource).getRepository(PacienteOrmEntity);

    const a = await registrar(tenantA);
    const b = await registrar(tenantB);
    tenantAId = a.tenantId;
    tokenA = await login(a.slug, tenantA);
    tokenB = await login(b.slug, tenantB);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /api/pacientes — correo obligatorio', () => {
    it('debería devolver 400 sin correo y no crear nada', async () => {
      // Arrange
      const antes = await pacientes.count();

      // Act
      const res = await request(server())
        .post('/api/pacientes')
        .set('Authorization', `Bearer ${tokenA}`)
        .send(sinCorreo)
        .expect(400);

      // Assert
      expect(JSON.stringify((res.body as ErrorBody).message)).toContain(
        'correo',
      );
      expect(await pacientes.count()).toBe(antes);
    });

    it.each(['no-es-correo', '', '   '])(
      'debería devolver 400 con correo %p',
      async (correo) => {
        await request(server())
          .post('/api/pacientes')
          .set('Authorization', `Bearer ${tokenA}`)
          .send({ ...pacienteValido, correo })
          .expect(400);
      },
    );

    it('debería crear con el correo normalizado (trim + minúsculas)', async () => {
      // Act
      const creado = await crearPaciente(tokenA, {
        ...pacienteValido,
        correo: '  Ana.Normalizada@Mail.COM ',
      });

      // Assert
      expect(creado.correo).toBe('ana.normalizada@mail.com');
      const fila = await pacientes.findOneByOrFail({ id: creado.id });
      expect(fila.correo).toBe('ana.normalizada@mail.com');
    });
  });

  describe('POST /api/citas — paciente en línea (mismo DTO)', () => {
    it('debería devolver 400 sin correo y no crear paciente ni cita', async () => {
      // Arrange
      const antes = await pacientes.count();

      // Act
      const res = await request(server())
        .post('/api/citas')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          inicio: inicioManana(),
          duracionMin: 30,
          tipoConsulta: 'Control',
          paciente: { ...sinCorreo, rut: '7.654.321-6' },
        })
        .expect(400);

      // Assert
      expect(JSON.stringify((res.body as ErrorBody).message)).toContain(
        'correo',
      );
      expect(await pacientes.count()).toBe(antes);
    });

    describe('paciente existente por RUT (ADR-13 §14)', () => {
      // RUT válido (módulo 11), canónico en BD.
      const RUT = '11.111.111-1';
      const RUT_CANONICO = '111111111';
      let fichaId: string;

      beforeAll(async () => {
        // Ficha vieja, anterior al correo obligatorio: solo se puede sembrar
        // por SQL, porque la API ya no deja crearla así.
        const fila = await pacientes.save({
          rut: RUT_CANONICO,
          nombre: 'Ficha Vieja',
          telefono: '+56 9 3333 3333',
          correo: null,
          consentimiento: true,
          tenantId: tenantAId,
        });
        fichaId = fila.id;
      });

      const agendarConRut = (correo: string) =>
        request(server())
          .post('/api/citas')
          .set('Authorization', `Bearer ${tokenA}`)
          .send({
            inicio: inicioManana(),
            duracionMin: 30,
            tipoConsulta: 'Control',
            paciente: {
              rut: RUT,
              nombre: 'Otro Nombre Tecleado',
              telefono: '+56 9 4444 4444',
              correo,
              consentimiento: false,
            },
          })
          .expect(201);

      it('debería completar el correo vacío y no tocar el resto de la ficha', async () => {
        // Act
        const res = await agendarConRut(' Primero@Mail.com ');

        // Assert
        const cita = res.body as CitaBody;
        expect(cita.pacienteId).toBe(fichaId);
        expect(cita.paciente.correo).toBe('primero@mail.com');
        const fila = await pacientes.findOneByOrFail({ id: fichaId });
        expect(fila).toMatchObject({
          nombre: 'Ficha Vieja',
          telefono: '+56 9 3333 3333',
          correo: 'primero@mail.com',
          consentimiento: true,
        });
        expect(await pacientes.countBy({ rut: RUT_CANONICO })).toBe(1);
      });

      it('NO debería reemplazar el correo cuando ya tiene uno distinto', async () => {
        // Act — mismo RUT, otro correo
        const res = await agendarConRut('segundo@mail.com');

        // Assert
        expect((res.body as CitaBody).paciente.correo).toBe('primero@mail.com');
        const fila = await pacientes.findOneByOrFail({ id: fichaId });
        expect(fila.correo).toBe('primero@mail.com');
      });
    });
  });

  describe('PATCH /api/pacientes/:id', () => {
    let paciente: PacienteBody;

    beforeEach(async () => {
      paciente = await crearPaciente(tokenA, {
        ...pacienteValido,
        rut: undefined,
        correo: 'antes@mail.com',
      });
    });

    it('debería actualizar telefono y correo y responder 200 con el DTO del alta', async () => {
      // Act
      const res = await patch(tokenA, paciente.id, {
        telefono: '+56 9 2222 2222',
        correo: ' Despues@Mail.com ',
      }).expect(200);

      // Assert
      expect(res.body).toEqual({
        id: paciente.id,
        rut: null,
        nombre: 'Ana Soto',
        telefono: '+56 9 2222 2222',
        correo: 'despues@mail.com',
        consentimiento: true,
        tenantId: tenantAId,
      });
      const fila = await pacientes.findOneByOrFail({ id: paciente.id });
      expect(fila.telefono).toBe('+56 9 2222 2222');
      expect(fila.correo).toBe('despues@mail.com');
    });

    it('debería actualizar solo el campo enviado', async () => {
      // Act
      const res = await patch(tokenA, paciente.id, {
        telefono: '+56 9 5555 5555',
      }).expect(200);

      // Assert
      const body = res.body as PacienteBody;
      expect(body.telefono).toBe('+56 9 5555 5555');
      expect(body.correo).toBe('antes@mail.com');
    });

    it('debería completar el correo de una ficha vieja sin correo', async () => {
      // Arrange
      await pacientes.update({ id: paciente.id }, { correo: null });

      // Act
      const res = await patch(tokenA, paciente.id, {
        correo: 'completo@mail.com',
      }).expect(200);

      // Assert
      expect((res.body as PacienteBody).correo).toBe('completo@mail.com');
    });

    it('debería ignorar campos fuera del contrato (whitelist)', async () => {
      // Act
      const res = await patch(tokenA, paciente.id, {
        telefono: '+56 9 6666 6666',
        nombre: 'Nombre Inyectado',
        tenantId: 'tenant-ATACANTE',
      }).expect(200);

      // Assert
      const body = res.body as PacienteBody;
      expect(body.nombre).toBe('Ana Soto');
      expect(body.tenantId).toBe(tenantAId);
    });

    it('debería devolver 404 (nunca 403) para un paciente de OTRO tenant, sin tocarlo', async () => {
      // Act
      await patch(tokenB, paciente.id, {
        correo: 'intruso@mail.com',
      }).expect(404);

      // Assert
      const fila = await pacientes.findOneByOrFail({ id: paciente.id });
      expect(fila.correo).toBe('antes@mail.com');
    });

    it('debería devolver 404 para un id inexistente', async () => {
      await patch(tokenA, '00000000-0000-4000-8000-000000000000', {
        telefono: '+56 9 7777 7777',
      }).expect(404);
    });

    it.each([
      ['vacío', {}],
      ['solo campos fuera del contrato', { nombre: 'X' }],
      ['correo inválido', { correo: 'no-es-correo' }],
      ['correo null', { correo: null }],
      ['correo en blanco', { correo: '   ' }],
      ['telefono vacío', { telefono: '' }],
    ])('debería devolver 400 con cuerpo %s', async (_caso, body) => {
      // Act
      await patch(tokenA, paciente.id, body).expect(400);

      // Assert — nada cambió
      const fila = await pacientes.findOneByOrFail({ id: paciente.id });
      expect(fila.correo).toBe('antes@mail.com');
      expect(fila.telefono).toBe('+56 9 1111 1111');
    });

    it('debería explicar en el 400 del cuerpo vacío qué campos admite', async () => {
      // Act
      const res = await patch(tokenA, paciente.id, {}).expect(400);

      // Assert
      expect((res.body as ErrorBody).message).toBe(
        'Envía al menos uno de estos campos: telefono, correo',
      );
    });

    it('debería devolver 400 si el id no es un UUID', async () => {
      await patch(tokenA, 'no-es-uuid', { telefono: '+56 9 1' }).expect(400);
    });

    it('debería devolver 401 sin token', async () => {
      await request(server())
        .patch(`/api/pacientes/${paciente.id}`)
        .send({ telefono: '+56 9 1' })
        .expect(401);
    });
  });
});
