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
import {
  CambioCita,
  TipoCambio,
} from '../../src/modules/cita/domain/cambio-cita.entity';
import {
  CambioCitaRepository,
  UltimoCambio,
} from '../../src/modules/cita/domain/cambio-cita.repository';
import { Cita, EstadoCita } from '../../src/modules/cita/domain/cita.entity';
import { CitaRepository } from '../../src/modules/cita/domain/cita.repository';
import { EnlaceCita } from '../../src/modules/cita/domain/enlace-cita.entity';
import { EnlaceCitaRepository } from '../../src/modules/cita/domain/enlace-cita.repository';
import {
  CambioContactoPaciente,
  Paciente,
} from '../../src/modules/paciente/domain/paciente.entity';
import { PacienteRepository } from '../../src/modules/paciente/domain/paciente.repository';
import {
  EstadoSolicitud,
  SolicitudCita,
  TipoSolicitud,
} from '../../src/modules/solicitud/domain/solicitud-cita.entity';
import {
  FiltrosListadoSolicitudes,
  SolicitudCitaRepository,
} from '../../src/modules/solicitud/domain/solicitud-cita.repository';

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
    origen: c.origen,
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
    tipo: s.tipo,
    citaOrigenId: s.citaOrigenId,
    enlaceId: s.enlaceId,
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

  buscarPorIdParaActualizar(
    id: string,
    tenantId: string,
    tx: TransactionContext,
  ): Promise<Cita | null> {
    // Mismo guardia que el adaptador real: sin tx el bloqueo no protege nada.
    if (!tx) {
      return Promise.reject(
        new Error('buscarPorIdParaActualizar requiere una transacción'),
      );
    }
    return this.buscarPorId(id, tenantId);
  }

  buscarPorIds(ids: readonly string[], tenantId: string): Promise<Cita[]> {
    return Promise.resolve(
      [...this.citas.values()]
        .filter((c) => ids.includes(c.id) && c.tenantId === tenantId)
        .map(clonarCita),
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
  private ultimoInstante = 0;

  /**
   * Como la BD, pone `ocurridoEn` si no viene (`DEFAULT now()`). Para que el
   * orden de inserción sea también el cronológico, el reloj del doble es
   * estrictamente creciente: dos cambios en el mismo milisegundo no empatan.
   */
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

  // Gana el `ocurridoEn` más reciente de cada tipo; a igual instante, el
  // último insertado (la BD desempata por `id`).
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

/**
 * Doble de `enlaces_cita`. Reproduce las tres claves únicas (hash,
 * (cita, versión) y un activo por cita) para `insertarSiNoExiste`, y exige
 * `tx` como el adaptador real. No reproduce bloqueos.
 */
export class InMemoryEnlaceCitaRepository extends EnlaceCitaRepository {
  readonly enlaces = new Map<string, EnlaceCita>();

  private static clonar(
    e: EnlaceCita,
    cambios: { primeraAperturaEn?: Date | null } = {},
  ): EnlaceCita {
    return EnlaceCita.reconstituir({
      id: e.id,
      citaId: e.citaId,
      tenantId: e.tenantId,
      version: e.version,
      tokenHash: e.tokenHash,
      emitidoEn: e.emitidoEn,
      revocadoEn: e.revocadoEn,
      motivoRevocacion: e.motivoRevocacion,
      revocadoPor: e.revocadoPor,
      primeraAperturaEn:
        cambios.primeraAperturaEn === undefined
          ? e.primeraAperturaEn
          : cambios.primeraAperturaEn,
    });
  }

  private static exigirTx(tx: TransactionContext, operacion: string): void {
    if (!tx) {
      throw new Error(
        `EnlaceCitaRepository.${operacion} requiere una transacción`,
      );
    }
  }

  buscarActivoPorCita(
    citaId: string,
    tx: TransactionContext,
  ): Promise<EnlaceCita | null> {
    InMemoryEnlaceCitaRepository.exigirTx(tx, 'buscarActivoPorCita');
    const e = [...this.enlaces.values()].find(
      (x) => x.citaId === citaId && x.estaActivo(),
    );
    return Promise.resolve(e ? InMemoryEnlaceCitaRepository.clonar(e) : null);
  }

  buscarPorTokenHash(
    hash: string,
    tx: TransactionContext,
  ): Promise<EnlaceCita | null> {
    InMemoryEnlaceCitaRepository.exigirTx(tx, 'buscarPorTokenHash');
    const e = [...this.enlaces.values()].find((x) => x.tokenHash === hash);
    return Promise.resolve(e ? InMemoryEnlaceCitaRepository.clonar(e) : null);
  }

  insertarSiNoExiste(
    enlace: EnlaceCita,
    tx: TransactionContext,
  ): Promise<boolean> {
    InMemoryEnlaceCitaRepository.exigirTx(tx, 'insertarSiNoExiste');
    const choca = [...this.enlaces.values()].some(
      (x) =>
        x.tokenHash === enlace.tokenHash ||
        (x.citaId === enlace.citaId && x.version === enlace.version) ||
        (x.citaId === enlace.citaId && x.estaActivo()),
    );
    if (choca) return Promise.resolve(false);
    const copia = InMemoryEnlaceCitaRepository.clonar(enlace);
    copia.id = randomUUID();
    copia.emitidoEn = new Date();
    this.enlaces.set(copia.id, copia);
    return Promise.resolve(true);
  }

  maxVersion(citaId: string, tx: TransactionContext): Promise<number | null> {
    InMemoryEnlaceCitaRepository.exigirTx(tx, 'maxVersion');
    const versiones = [...this.enlaces.values()]
      .filter((x) => x.citaId === citaId)
      .map((x) => x.version);
    return Promise.resolve(
      versiones.length === 0 ? null : Math.max(...versiones),
    );
  }

  guardar(enlace: EnlaceCita, tx: TransactionContext): Promise<EnlaceCita> {
    InMemoryEnlaceCitaRepository.exigirTx(tx, 'guardar');
    const actual = this.enlaces.get(enlace.id);
    if (!actual) {
      return Promise.reject(
        new Error('EnlaceCitaRepository.guardar: el enlace no existe'),
      );
    }
    // Como el UPDATE real: solo revoca uno activo; gana la primera revocación.
    // Solo escribe la revocación: la primera apertura guardada no se pisa.
    if (actual.estaActivo() && !enlace.estaActivo()) {
      this.enlaces.set(
        enlace.id,
        InMemoryEnlaceCitaRepository.clonar(enlace, {
          primeraAperturaEn: actual.primeraAperturaEn,
        }),
      );
    }
    return Promise.resolve(
      InMemoryEnlaceCitaRepository.clonar(this.enlaces.get(enlace.id)!),
    );
  }

  // Como el UPDATE real: escribe solo si todavía no tenía apertura.
  registrarPrimeraApertura(
    enlaceId: string,
    ahora: Date,
    tx: TransactionContext,
  ): Promise<boolean> {
    InMemoryEnlaceCitaRepository.exigirTx(tx, 'registrarPrimeraApertura');
    const actual = this.enlaces.get(enlaceId);
    if (!actual || actual.primeraAperturaEn !== null) {
      return Promise.resolve(false);
    }
    this.enlaces.set(
      enlaceId,
      InMemoryEnlaceCitaRepository.clonar(actual, {
        primeraAperturaEn: new Date(ahora.getTime()),
      }),
    );
    return Promise.resolve(true);
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

  actualizarContacto(
    id: string,
    tenantId: string,
    cambio: CambioContactoPaciente,
  ): Promise<boolean> {
    const p = this.pacientes.get(id);
    if (!p || p.tenantId !== tenantId) return Promise.resolve(false);
    this.pacientes.set(id, { ...p, ...cambio });
    return Promise.resolve(true);
  }

  // Misma condición que el UPDATE real: solo si el correo es NULL o blanco.
  completarCorreoSiVacio(
    id: string,
    tenantId: string,
    correo: string,
  ): Promise<boolean> {
    const p = this.pacientes.get(id);
    if (!p || p.tenantId !== tenantId || (p.correo ?? '').trim() !== '') {
      return Promise.resolve(false);
    }
    this.pacientes.set(id, { ...p, correo });
    return Promise.resolve(true);
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
        x.tipo === TipoSolicitud.NUEVA &&
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

  buscarReagendamientoAbierto(
    citaOrigenId: string,
    tenantId: string,
  ): Promise<SolicitudCita | null> {
    const s = [...this.solicitudes.values()].find(
      (x) =>
        x.citaOrigenId === citaOrigenId &&
        x.tenantId === tenantId &&
        x.tipo === TipoSolicitud.REAGENDAMIENTO &&
        x.estado === EstadoSolicitud.RECIBIDA,
    );
    return Promise.resolve(s ? clonarSolicitud(s) : null);
  }

  buscarReagendamientoAbiertoParaActualizar(
    citaOrigenId: string,
    tenantId: string,
    tx: TransactionContext,
  ): Promise<SolicitudCita | null> {
    if (!tx) {
      return Promise.reject(
        new Error(
          'buscarReagendamientoAbiertoParaActualizar requiere una transacción',
        ),
      );
    }
    this.cargasConBloqueo.push(tx);
    return this.buscarReagendamientoAbierto(citaOrigenId, tenantId);
  }

  listarPorEstado(
    tenantId: string,
    estado: EstadoSolicitud,
    limite: number,
    filtros?: FiltrosListadoSolicitudes,
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
        .filter(
          (s) =>
            s.tenantId === tenantId &&
            s.estado === estado &&
            (filtros?.citaOrigenId === undefined ||
              s.citaOrigenId === filtros.citaOrigenId),
        )
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
