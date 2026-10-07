import { Logger } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';

import { typeOrmTestConfig } from '../../../../test/typeorm-test.config';
import { EstadoEventoSalida } from '../../../shared/application/eventos-salida.repository';
import { PublicadorEventos } from '../../../shared/application/publicador-eventos';
import {
  EventoEntregado,
  SuscriptorEventos,
} from '../../../shared/application/suscriptor-eventos';
import { DespachadorEventosSalida } from '../../../shared/infrastructure/salida/despachador-eventos-salida';
import { EventoSalidaOrmEntity } from '../../../shared/infrastructure/salida/evento-salida.orm-entity';
import { RegistroSuscriptores } from '../../../shared/infrastructure/salida/registro-suscriptores';
import { AuthenticatedUser } from '../../auth/jwt-payload.interface';
import { PacienteOrmEntity } from '../../paciente/infrastructure/persistence/paciente.orm-entity';
import { TenantOrmEntity } from '../../tenant/infrastructure/persistence/tenant.orm-entity';
import { RolUsuario } from '../../usuario/domain/usuario.entity';
import { UsuarioOrmEntity } from '../../usuario/infrastructure/persistence/usuario.orm-entity';
import { CitasService } from '../application/citas.service';
import { CitaModule } from '../cita.module';
import { TipoCambio } from '../domain/cambio-cita.entity';
import { EstadoCita } from '../domain/cita.entity';
import { CitaRepository } from '../domain/cita.repository';
import { CambioCitaOrmEntity } from '../infrastructure/persistence/cambio-cita.orm-entity';
import { CitaOrmEntity } from '../infrastructure/persistence/cita.orm-entity';
import { CrearCitaDto } from '../presentation/dto/crear-cita.dto';

/**
 * Atomicidad del outbox con un caso de uso real (ADR-12 §1–§2, US-03 paso 6).
 *
 * `CitasService` con sus repositorios TypeORM, `TypeOrmTransactionRunner` y
 * `PublicadorEventosEnSalida` reales (CitaModule + SharedModule) contra
 * PostgreSQL: el hecho y el cambio de negocio se confirman juntos o ninguno.
 *
 * ⚠️ REQUIERE PostgreSQL real (vars TEST_DB_*), con synchronize/dropSchema.
 */

const configuracionTypeOrm: TypeOrmModuleOptions = {
  ...typeOrmTestConfig,
  entities: [
    TenantOrmEntity,
    UsuarioOrmEntity,
    PacienteOrmEntity,
    CitaOrmEntity,
    CambioCitaOrmEntity,
    EventoSalidaOrmEntity,
  ],
};

// Datos personales del paciente: NINGUNO puede terminar en el payload.
const PACIENTE = {
  nombre: 'María José Pérez Soto',
  rut: '12.345.678-5',
  telefono: '+56 9 8765 4321',
  correo: 'maria.perez@correo.cl',
  consentimiento: true,
};
// Dato de salud: tampoco viaja en el hecho (ADR-13 §12).
const TIPO_CONSULTA = 'Control psiquiátrico';

const CLAVES_PAYLOAD_CITA = [
  'citaId',
  'estado',
  'inicio',
  'inicioAnterior',
  'pacienteId',
  'usuarioId',
];

/** Suscriptor de prueba: guarda lo que recibe. */
class SuscriptorCitasPrueba extends SuscriptorEventos {
  readonly eventos = ['CitaCreada'];
  readonly recibidos: EventoEntregado[] = [];

  manejar(evento: EventoEntregado): Promise<void> {
    this.recibidos.push(evento);
    return Promise.resolve();
  }
}

describe('CitasService + outbox eventos_salida (integration)', () => {
  let modulo: TestingModule;
  let dataSource: DataSource;
  let service: CitasService;
  let actor: AuthenticatedUser;

  const filasSalida = (): Promise<EventoSalidaOrmEntity[]> =>
    dataSource
      .getRepository(EventoSalidaOrmEntity)
      .find({ order: { ocurridoEn: 'ASC' } });

  const dtoCita = (): CrearCitaDto => ({
    // Mañana: no depende de la hora a la que corra el test.
    inicio: new Date(Date.now() + 86_400_000).toISOString(),
    duracionMin: 45,
    tipoConsulta: TIPO_CONSULTA,
    paciente: { ...PACIENTE },
  });

  beforeAll(async () => {
    modulo = await Test.createTestingModule({
      imports: [
        // CitaModule lee APP_TZ con ConfigService (default America/Santiago).
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        TypeOrmModule.forRoot(configuracionTypeOrm),
        // Importa SharedModule: TransactionRunner y PublicadorEventos reales.
        CitaModule,
      ],
    }).compile();

    dataSource = modulo.get(DataSource);
    service = modulo.get(CitasService);

    const tenant = await dataSource
      .getRepository(TenantOrmEntity)
      .save({ nombre: 'Clínica Outbox', slug: 'clinica-outbox' });
    const usuario = await dataSource.getRepository(UsuarioOrmEntity).save({
      email: 'profesional@outbox.cl',
      passwordHash: '$2b$10$hash-de-prueba',
      nombreCompleto: 'Profesional Outbox',
      rol: RolUsuario.PROFESIONAL,
      tenantId: tenant.id,
    });
    actor = {
      userId: usuario.id,
      email: usuario.email,
      tenantId: tenant.id,
      rol: RolUsuario.PROFESIONAL,
    };
  });

  beforeEach(async () => {
    await dataSource.query(
      'TRUNCATE eventos_salida, cambios_cita, citas, pacientes',
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    await modulo.close();
  });

  describe('crear cita', () => {
    it('debería dejar exactamente un CitaCreada pendiente, con su tenant y sin datos personales, cuando la transacción confirma', async () => {
      // Act
      const cita = await service.crearCita(dtoCita(), actor);

      // Assert: el cambio de negocio existe…
      expect(await dataSource.getRepository(CitaOrmEntity).count()).toBe(1);
      expect(await dataSource.getRepository(CambioCitaOrmEntity).count()).toBe(
        1,
      );

      // …y con él, UNA fila en el outbox lista para despachar.
      const filas = await filasSalida();
      expect(filas).toHaveLength(1);
      const [fila] = filas;
      expect(fila).toMatchObject({
        nombre: 'CitaCreada',
        tenantId: actor.tenantId,
        estado: EstadoEventoSalida.PENDIENTE,
        intentos: 0,
        ultimoError: null,
        entregadoEn: null,
      });
      expect(fila.proximoIntentoEn.getTime()).toBeLessThanOrEqual(
        fila.creadoEn.getTime(),
      );

      // Payload: solo ids y datos no sensibles (ADR-09 §3 regla 5).
      expect(Object.keys(fila.payload).sort()).toEqual(CLAVES_PAYLOAD_CITA);
      expect(fila.payload).toMatchObject({
        citaId: cita.id,
        pacienteId: cita.pacienteId,
        usuarioId: actor.userId,
        estado: EstadoCita.PENDIENTE,
        inicioAnterior: null,
      });
      const crudo = JSON.stringify(fila.payload);
      for (const prohibido of [
        PACIENTE.nombre,
        'Pérez',
        '12.345.678',
        '12345678',
        '8765',
        PACIENTE.correo,
        '@',
        TIPO_CONSULTA,
      ]) {
        expect(crudo).not.toContain(prohibido);
      }
    });

    it('no debería dejar fila en eventos_salida ni cambios de negocio cuando la transacción falla DESPUÉS de publicar', async () => {
      // Arrange: `calcularAvisos` corre después de `publicar` dentro de la
      // misma transacción. Se hace fallar ahí, mirando antes que el hecho SÍ
      // se había escrito en esa transacción.
      const citaRepository = modulo.get<CitaRepository>(CitaRepository);
      let filasDentroDeLaTransaccion = -1;
      jest
        .spyOn(citaRepository, 'buscarPorProfesionalEnRango')
        .mockImplementationOnce(async (...args: unknown[]) => {
          const tx = args[5] as EntityManager;
          filasDentroDeLaTransaccion = await tx.count(EventoSalidaOrmEntity);
          throw new Error('fallo simulado en calcularAvisos');
        });

      // Act
      await expect(service.crearCita(dtoCita(), actor)).rejects.toThrow(
        'fallo simulado en calcularAvisos',
      );

      // Assert: se había publicado…
      expect(filasDentroDeLaTransaccion).toBe(1);
      // …y se revirtió junto con todo lo demás.
      expect(await filasSalida()).toHaveLength(0);
      expect(await dataSource.getRepository(CitaOrmEntity).count()).toBe(0);
      expect(await dataSource.getRepository(CambioCitaOrmEntity).count()).toBe(
        0,
      );
      expect(await dataSource.getRepository(PacienteOrmEntity).count()).toBe(0);
    });
  });

  describe('cancelar cita', () => {
    it('debería dejar un CitaCancelada pendiente con estado cancelada cuando la transacción confirma', async () => {
      // Arrange
      const cita = await service.crearCita(dtoCita(), actor);

      // Act
      await service.cancelar(cita.id, actor, 'El paciente avisó');

      // Assert
      const filas = await filasSalida();
      expect(filas.map((f) => f.nombre)).toEqual([
        'CitaCreada',
        'CitaCancelada',
      ]);
      const cancelada = filas[1];
      expect(cancelada.tenantId).toBe(actor.tenantId);
      expect(cancelada.estado).toBe(EstadoEventoSalida.PENDIENTE);
      expect(Object.keys(cancelada.payload).sort()).toEqual(
        CLAVES_PAYLOAD_CITA,
      );
      expect(cancelada.payload).toMatchObject({
        citaId: cita.id,
        estado: EstadoCita.CANCELADA,
      });
      // El motivo es texto libre: no viaja en el hecho.
      expect(JSON.stringify(cancelada.payload)).not.toContain('avisó');
    });

    it('no debería dejar CitaCancelada ni cancelar la cita cuando algo falla DESPUÉS de publicar', async () => {
      // Arrange
      const cita = await service.crearCita(dtoCita(), actor);
      const publicador = modulo.get<PublicadorEventos>(PublicadorEventos);
      // `bind` devuelve `any` con strictBindCallApply apagado (tsconfig de Nest).
      const publicarReal = publicador.publicar.bind(
        publicador,
      ) as PublicadorEventos['publicar'];
      let canceladasDentroDeLaTransaccion = -1;
      jest
        .spyOn(publicador, 'publicar')
        .mockImplementationOnce(async (evento, tx) => {
          await publicarReal(evento, tx);
          canceladasDentroDeLaTransaccion = await (tx as EntityManager).count(
            EventoSalidaOrmEntity,
            { where: { nombre: 'CitaCancelada' } },
          );
          throw new Error('fallo simulado después de publicar');
        });

      // Act
      await expect(service.cancelar(cita.id, actor, 'motivo')).rejects.toThrow(
        'fallo simulado después de publicar',
      );

      // Assert: el hecho llegó a escribirse en la transacción…
      expect(canceladasDentroDeLaTransaccion).toBe(1);
      // …pero no sobrevive: solo queda el CitaCreada del alta.
      expect((await filasSalida()).map((f) => f.nombre)).toEqual([
        'CitaCreada',
      ]);
      // Y la cita sigue como estaba, sin rastro de la cancelación.
      const orm = await dataSource
        .getRepository(CitaOrmEntity)
        .findOneByOrFail({ id: cita.id });
      expect(orm.estado).toBe(EstadoCita.PENDIENTE);
      const cambios = await dataSource
        .getRepository(CambioCitaOrmEntity)
        .find({ where: { citaId: cita.id } });
      expect(cambios.map((c) => c.tipo)).toEqual([TipoCambio.CREADA]);
    });
  });

  describe('de punta a punta con el despachador de SharedModule', () => {
    it('debería entregar el CitaCreada confirmado al suscriptor registrado, con su id y su tenant, y marcarlo entregado', async () => {
      // Arrange
      jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
      const suscriptor = new SuscriptorCitasPrueba();
      modulo.get(RegistroSuscriptores).registrar(suscriptor);
      const despachador = modulo.get(DespachadorEventosSalida);
      const cita = await service.crearCita(dtoCita(), actor);
      const [fila] = await filasSalida();

      // Act
      const resultado = await despachador.despachar({
        lote: 10,
        politica: {
          maxIntentos: 3,
          esperaBaseMs: 10_000,
          esperaMaximaMs: 60_000,
          variacion: 0,
        },
      });

      // Assert
      expect(resultado).toMatchObject({ procesados: 1, entregados: 1 });
      expect(suscriptor.recibidos).toHaveLength(1);
      expect(suscriptor.recibidos[0]).toMatchObject({
        id: fila.id,
        nombre: 'CitaCreada',
        tenantId: actor.tenantId,
        payload: expect.objectContaining({ citaId: cita.id }) as unknown,
      });
      const entregada = await dataSource
        .getRepository(EventoSalidaOrmEntity)
        .findOneByOrFail({ id: fila.id });
      expect(entregada.estado).toBe(EstadoEventoSalida.ENTREGADO);
      expect(entregada.entregadoEn).toBeInstanceOf(Date);
    });
  });
});
