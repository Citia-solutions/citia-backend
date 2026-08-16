/**
 * Seed idempotente de datos demo para desarrollo.
 *
 * Puebla la BD con lo mínimo para probar US-06 (dashboard de citas del día,
 * GET /api/citas/hoy):
 *   - 1 Tenant CLINICA + 1 Usuario ADMIN con credenciales FIJAS.
 *   - 3 Pacientes del tenant.
 *   - 6 Citas para HOY con estados variados y horas repartidas.
 *
 * Diseño:
 *   - Reutiliza el dominio y los servicios/repositorios YA wired
 *     (NestFactory.createApplicationContext), heredando bcrypt, generación de
 *     slug, la fábrica Cita.crear() y la máquina de estados. No hace INSERTs
 *     crudos que salten invariantes.
 *   - Idempotente: si el tenant demo ya existe (por slug), borra SOLO sus datos
 *     demo (citas, pacientes, usuarios y el propio tenant) y los recrea. Así se
 *     puede correr N veces sin duplicar por UNIQUE ni acumular basura, y las
 *     citas siempre quedan referidas al "hoy" de la corrida.
 *   - Las horas de inicio se generan como offsets relativos a `new Date()`
 *     (ahora ± minutos), NO con horas absolutas: así caen dentro del "hoy" de
 *     la clínica tanto si el seed corre en el host (hora local) como dentro del
 *     contenedor (UTC).
 *
 * Correr:  npm run seed
 */
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';

import { AppModule } from '../app.module';
import { Cita, EstadoCita } from '../modules/cita/domain/cita.entity';
import { CitaRepository } from '../modules/cita/domain/cita.repository';
import { CitaOrmEntity } from '../modules/cita/infrastructure/persistence/cita.orm-entity';
import { PacientesService } from '../modules/paciente/application/pacientes.service';
import { PacienteOrmEntity } from '../modules/paciente/infrastructure/persistence/paciente.orm-entity';
import { PacienteResponseDto } from '../modules/paciente/presentation/dto/paciente-response.dto';
import { TipoTenant } from '../modules/tenant/domain/tenant.entity';
import { ITenantRepository } from '../modules/tenant/domain/tenant.repository';
import { TenantOrmEntity } from '../modules/tenant/infrastructure/persistence/tenant.orm-entity';
import { UsuariosService } from '../modules/usuario/application/usuarios.service';
import { UsuarioOrmEntity } from '../modules/usuario/infrastructure/persistence/usuario.orm-entity';

// --- Credenciales demo FIJAS y conocidas ---------------------------------
const DEMO = {
  nombreTenant: 'Clínica Demo',
  // slugify('Clínica Demo') === 'clinica-demo' (se usa para la idempotencia).
  tenantSlug: 'clinica-demo',
  email: 'admin@clinicademo.cl',
  password: 'Demo1234',
  nombreCompleto: 'Admin Demo',
} as const;

// --- Definición de las citas del día (offsets relativos a AHORA) ----------
// Se usan métodos de transición del dominio para materializar estados no
// PENDIENTE, respetando la máquina de estados (nadie asigna `estado` a mano).
type EstadoObjetivo =
  | EstadoCita.PENDIENTE
  | EstadoCita.CONFIRMADA
  | EstadoCita.ASISTIO
  | EstadoCita.CANCELADA
  | EstadoCita.NO_ASISTIO;

interface PlanCita {
  offsetMin: number; // minutos respecto de "ahora" (negativo = en el pasado)
  duracionMin: number;
  tipoConsulta: string;
  pacienteIdx: number; // índice dentro del array de pacientes creados
  estado: EstadoObjetivo;
}

const PLAN_CITAS: PlanCita[] = [
  {
    offsetMin: -60,
    duracionMin: 30,
    tipoConsulta: 'Control',
    pacienteIdx: 0,
    estado: EstadoCita.CONFIRMADA,
  },
  {
    offsetMin: -30,
    duracionMin: 45,
    tipoConsulta: 'Primera consulta',
    pacienteIdx: 1,
    estado: EstadoCita.ASISTIO,
  },
  {
    offsetMin: 30,
    duracionMin: 30,
    tipoConsulta: 'Control',
    pacienteIdx: 2,
    estado: EstadoCita.PENDIENTE,
  },
  {
    offsetMin: 90,
    duracionMin: 60,
    tipoConsulta: 'Evaluación',
    pacienteIdx: 0,
    estado: EstadoCita.CONFIRMADA,
  },
  {
    offsetMin: 150,
    duracionMin: 30,
    tipoConsulta: 'Seguimiento',
    pacienteIdx: 1,
    estado: EstadoCita.NO_ASISTIO,
  },
  {
    offsetMin: 210,
    duracionMin: 45,
    tipoConsulta: 'Control',
    pacienteIdx: 2,
    estado: EstadoCita.CANCELADA,
  },
];

const PACIENTES = [
  {
    nombre: 'María Fernández',
    contacto: '+56 9 1111 1111',
    consentimiento: true,
  },
  { nombre: 'Juan Pérez', contacto: '+56 9 2222 2222', consentimiento: true },
  {
    nombre: 'Camila Rojas',
    contacto: '+56 9 3333 3333',
    consentimiento: false,
  },
];

// Aplica las transiciones necesarias para llevar una cita nueva (PENDIENTE) al
// estado objetivo, usando SOLO los métodos de dominio.
function llevarAEstado(cita: Cita, objetivo: EstadoObjetivo): void {
  switch (objetivo) {
    case EstadoCita.PENDIENTE:
      break;
    case EstadoCita.CONFIRMADA:
      cita.confirmar();
      break;
    case EstadoCita.ASISTIO:
      cita.confirmar();
      cita.marcarAsistencia();
      break;
    case EstadoCita.NO_ASISTIO:
      cita.confirmar();
      cita.marcarInasistencia();
      break;
    case EstadoCita.CANCELADA:
      cita.cancelar();
      break;
  }
}

// Borra SOLO los datos del tenant demo, en orden de dependencia de FKs.
async function limpiarDatosDemo(
  dataSource: DataSource,
  tenantId: string,
): Promise<void> {
  await dataSource.transaction(async (m) => {
    await m.delete(CitaOrmEntity, { tenantId });
    await m.delete(PacienteOrmEntity, { tenantId });
    await m.delete(UsuarioOrmEntity, { tenantId });
    await m.delete(TenantOrmEntity, { id: tenantId });
  });
}

async function seed(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  try {
    const dataSource = app.get(DataSource);
    const tenantRepository = app.get(ITenantRepository, { strict: false });
    const usuariosService = app.get(UsuariosService, { strict: false });
    const pacientesService = app.get(PacientesService, { strict: false });
    const citaRepository = app.get(CitaRepository, { strict: false });

    // 1) Idempotencia: si el tenant demo ya existe, se limpian sus datos para
    //    recrearlos frescos (y liberar el slug para el registro).
    const existente = await tenantRepository.findBySlug(DEMO.tenantSlug);
    if (existente) {
      console.log(
        `[seed] Tenant demo "${DEMO.tenantSlug}" ya existe (${existente.id}); limpiando datos demo...`,
      );
      await limpiarDatosDemo(dataSource, existente.id);
    }

    // 2) Tenant CLINICA + Usuario ADMIN (atómico, con bcrypt y slug via service).
    const registro = await usuariosService.registrar({
      nombreTenant: DEMO.nombreTenant,
      tipoTenant: TipoTenant.CLINICA,
      email: DEMO.email,
      password: DEMO.password,
      nombreCompleto: DEMO.nombreCompleto,
    });
    console.log(
      `[seed] Tenant "${registro.nombreTenant}" (${registro.tenantSlug}) + admin creados.`,
    );

    // 3) Pacientes del tenant.
    const pacientes: PacienteResponseDto[] = [];
    for (const p of PACIENTES) {
      const creado = await pacientesService.crearPaciente(p, registro.tenantId);
      pacientes.push(creado);
    }
    console.log(`[seed] ${pacientes.length} pacientes creados.`);

    // 4) Citas de HOY, con horas relativas a "ahora" y estados variados.
    const ahora = Date.now();
    for (const plan of PLAN_CITAS) {
      const cita = Cita.crear({
        inicio: new Date(ahora + plan.offsetMin * 60_000),
        duracionMin: plan.duracionMin,
        tipoConsulta: plan.tipoConsulta,
        tenantId: registro.tenantId,
        pacienteId: pacientes[plan.pacienteIdx].id,
        usuarioId: registro.id,
      });
      llevarAEstado(cita, plan.estado);
      await citaRepository.guardar(cita);
    }
    console.log(`[seed] ${PLAN_CITAS.length} citas creadas para hoy.`);

    // 5) Resumen de credenciales demo.
    console.log('\n==================== SEED OK ====================');
    console.log('Credenciales demo para login (POST /api/auth/login):');
    console.log(`  tenantSlug : ${registro.tenantSlug}`);
    console.log(`  email      : ${DEMO.email}`);
    console.log(`  password   : ${DEMO.password}`);
    console.log('=================================================\n');
  } finally {
    await app.close();
  }
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[seed] Error durante el seed:', err);
    process.exit(1);
  });
