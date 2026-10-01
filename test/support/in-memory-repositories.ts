import { randomUUID } from 'node:crypto';

import {
  EventoDominio,
  PublicadorEventos,
} from '../../src/shared/application/publicador-eventos';
import {
  TransactionContext,
  TransactionRunner,
} from '../../src/shared/application/transaction-runner';
import { rangoDelDiaEnZona } from '../../src/shared/domain/timezone';
import { CambioCita } from '../../src/modules/cita/domain/cambio-cita.entity';
import { CambioCitaRepository } from '../../src/modules/cita/domain/cambio-cita.repository';
import { Cita, EstadoCita } from '../../src/modules/cita/domain/cita.entity';
import { CitaRepository } from '../../src/modules/cita/domain/cita.repository';
import { Paciente } from '../../src/modules/paciente/domain/paciente.entity';
import { PacienteRepository } from '../../src/modules/paciente/domain/paciente.repository';
import {
  EstadoSolicitud,
  SolicitudCita,
} from '../../src/modules/solicitud/domain/solicitud-cita.entity';
import { SolicitudCitaRepository } from '../../src/modules/solicitud/domain/solicitud-cita.repository';

/**
 * Dobles de persistencia para las e2e SIN base de datos.
 *
 * Respetan el contrato de cada puerto (filtro por tenant, orden, tope) y
 * guardan COPIAS: una entidad mutada en memoria por el caso de uso no queda
 * "persistida" hasta que se llama a `guardar`, igual que con una BD real. Lo
 * que no reproducen (sigue pendiente contra Postgres, DT-20): el SQL real,
 * `FOR UPDATE`, índices y NULLS LAST.
 */

const clonarCita = (c: Cita): Cita =>
  Cita.reconstituir({
    id: c.id,
    inicio: new Date(c.inicio.getTime()),
    duracionMin: c.duracionMin,
    tipoConsulta: c.tipoConsulta,
    estado: c.estado,
    tenantId: c.tenantId,
    pacienteId: c.pacienteId,
    usuarioId: c.usuarioId,
    creadoEn: c.creadoEn,
    actualizadoEn: c.actualizadoEn,
  });

const clonarSolicitud = (s: SolicitudCita): SolicitudCita =>
  SolicitudCita.reconstituir({
    id: s.id,
    tenantId: s.tenantId,
    usuarioId: s.usuarioId,
    rut: s.rut,
    nombrePaciente: s.nombrePaciente,
    telefono: s.telefono,
    correo: s.correo,
    motivo: s.motivo,
    preferenciaHoraria: s.preferenciaHoraria,
    consentimiento: s.consentimiento,
    estado: s.estado,
    citaId: s.citaId,
    recibidaEn: s.recibidaEn,
    resueltaEn: s.resueltaEn,
  });

export class InMemoryCitaRepository extends CitaRepository {
  readonly citas = new Map<string, Cita>();

  constructor(private readonly tz: string) {
    super();
  }

  /** Siembra una cita tal cual (con su id y creadoEn). */
  sembrar(cita: Cita): void {
    this.citas.set(cita.id, clonarCita(cita));
  }

  guardar(cita: Cita): Promise<Cita> {
    // Como la BD: id y marcas de tiempo los pone la persistencia.
    const ahora = new Date();
    const copia = clonarCita(cita);
    if (copia.id === undefined) copia.id = randomUUID();
    if (copia.creadoEn === undefined) copia.creadoEn = ahora;
    copia.actualizadoEn = ahora;
    this.citas.set(copia.id, copia);
    return Promise.resolve(clonarCita(copia));
  }

  buscarPorId(id: string, tenantId: string): Promise<Cita | null> {
    const cita = this.citas.get(id);
    return Promise.resolve(
      cita && cita.tenantId === tenantId ? clonarCita(cita) : null,
    );
  }

  buscarDelDiaPorProfesional(
    tenantId: string,
    usuarioId: string,
    dia: Date,
  ): Promise<Cita[]> {
    const { desde, hasta } = rangoDelDiaEnZona(dia, this.tz);
    return this.buscarPorProfesionalEnRango(tenantId, usuarioId, desde, hasta);
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
        )
        .map(clonarCita),
    );
  }
}

export class InMemoryCambioCitaRepository extends CambioCitaRepository {
  readonly cambios: CambioCita[] = [];

  registrar(cambio: CambioCita): Promise<CambioCita> {
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
}

export class InMemoryPacienteRepository extends PacienteRepository {
  readonly pacientes = new Map<string, Paciente>();

  guardar(paciente: Partial<Paciente>): Promise<Paciente> {
    const p = { ...paciente, id: paciente.id ?? randomUUID() } as Paciente;
    this.pacientes.set(p.id, p);
    return Promise.resolve({ ...p });
  }

  buscarPorId(id: string, tenantId: string): Promise<Paciente | null> {
    const p = this.pacientes.get(id);
    return Promise.resolve(p && p.tenantId === tenantId ? { ...p } : null);
  }

  buscarPorRut(rut: string, tenantId: string): Promise<Paciente | null> {
    const p = [...this.pacientes.values()].find(
      (x) => x.rut === rut && x.tenantId === tenantId,
    );
    return Promise.resolve(p ? { ...p } : null);
  }

  buscarPorIds(ids: readonly string[], tenantId: string): Promise<Paciente[]> {
    return Promise.resolve(
      [...this.pacientes.values()]
        .filter((x) => ids.includes(x.id) && x.tenantId === tenantId)
        .map((x) => ({ ...x })),
    );
  }
}

export class InMemorySolicitudCitaRepository extends SolicitudCitaRepository {
  readonly solicitudes = new Map<string, SolicitudCita>();
  /** Cuántas veces se pidió la carga con bloqueo, y con qué contexto. */
  readonly cargasConBloqueo: TransactionContext[] = [];

  sembrar(solicitud: SolicitudCita): void {
    this.solicitudes.set(solicitud.id, clonarSolicitud(solicitud));
  }

  guardar(solicitud: SolicitudCita): Promise<SolicitudCita> {
    const copia = clonarSolicitud(solicitud);
    if (copia.id === undefined) copia.id = randomUUID();
    if (copia.recibidaEn === undefined) copia.recibidaEn = new Date();
    this.solicitudes.set(copia.id, copia);
    return Promise.resolve(clonarSolicitud(copia));
  }

  buscarAbiertaPorRut(
    rut: string,
    tenantId: string,
    desde: Date,
  ): Promise<SolicitudCita | null> {
    const s = [...this.solicitudes.values()].find(
      (x) =>
        x.rut === rut &&
        x.tenantId === tenantId &&
        x.estado === EstadoSolicitud.RECIBIDA &&
        x.recibidaEn >= desde,
    );
    return Promise.resolve(s ? clonarSolicitud(s) : null);
  }

  buscarPorId(id: string, tenantId: string): Promise<SolicitudCita | null> {
    const s = this.solicitudes.get(id);
    return Promise.resolve(
      s && s.tenantId === tenantId ? clonarSolicitud(s) : null,
    );
  }

  buscarPorIdParaActualizar(
    id: string,
    tenantId: string,
    tx: TransactionContext,
  ): Promise<SolicitudCita | null> {
    // Mismo guardia que el adaptador real: sin tx el bloqueo no protege nada.
    if (!tx) {
      return Promise.reject(
        new Error('buscarPorIdParaActualizar requiere una transacción'),
      );
    }
    this.cargasConBloqueo.push(tx);
    return this.buscarPorId(id, tenantId);
  }

  listarPorEstado(
    tenantId: string,
    estado: EstadoSolicitud,
    limite: number,
  ): Promise<SolicitudCita[]> {
    const t = (d: Date | null): number => (d ? d.getTime() : -Infinity);
    const orden =
      estado === EstadoSolicitud.RECIBIDA
        ? (a: SolicitudCita, b: SolicitudCita) =>
            t(a.recibidaEn) - t(b.recibidaEn) || a.id.localeCompare(b.id)
        : (a: SolicitudCita, b: SolicitudCita) =>
            t(b.resueltaEn) - t(a.resueltaEn) || a.id.localeCompare(b.id);
    return Promise.resolve(
      [...this.solicitudes.values()]
        .filter((s) => s.tenantId === tenantId && s.estado === estado)
        .sort(orden)
        .slice(0, limite)
        .map(clonarSolicitud),
    );
  }
}

/** TransactionRunner de paso: cuenta las transacciones abiertas. */
export class ContadorTransacciones extends TransactionRunner {
  abiertas = 0;
  // Contexto que recibió el último `work`: permite comprobar por identidad que
  // un puerto (p. ej. el publicador) recibió ESE tx y no otro.
  ultimoContexto: TransactionContext = undefined;

  run<T>(work: (tx: TransactionContext) => Promise<T>): Promise<T> {
    this.abiertas += 1;
    this.ultimoContexto = { tx: this.abiertas };
    return work(this.ultimoContexto);
  }
}

/**
 * Publicador que acumula los hechos para inspeccionarlos (ADR-12 §2).
 *
 * `contextos[i]` es el `tx` con el que se publicó `eventos[i]`: permite
 * comprobar que el hecho viaja en la transacción del caso de uso. Como el
 * adaptador real del outbox, rechaza la publicación sin `tx`.
 *
 * Lo que NO reproduce: la atomicidad. `ContadorTransacciones` no revierte, así
 * que un hecho publicado antes de un fallo queda aquí igual (la reversión se
 * prueba contra Postgres).
 */
export class PublicadorEnMemoria extends PublicadorEventos {
  readonly eventos: EventoDominio[] = [];
  readonly contextos: TransactionContext[] = [];

  publicar(evento: EventoDominio, tx: TransactionContext): Promise<void> {
    if (tx === undefined || tx === null) {
      return Promise.reject(
        new Error('publicar requiere la transacción del caso de uso'),
      );
    }
    this.eventos.push(evento);
    this.contextos.push(tx);
    return Promise.resolve();
  }

  limpiar(): void {
    this.eventos.length = 0;
    this.contextos.length = 0;
  }
}
