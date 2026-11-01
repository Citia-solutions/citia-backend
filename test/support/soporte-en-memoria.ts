import {
  TransactionContext,
  TransactionRunner,
} from '../../src/shared/application/transaction-runner';
import {
  DatosMensajeSoporte,
  EstadoEnvioSoporte,
  MensajeSoporte,
} from '../../src/modules/soporte/domain/mensaje-soporte.entity';
import { MensajeSoporteRepository } from '../../src/modules/soporte/domain/mensaje-soporte.repository';

/**
 * Dobles en memoria del módulo `soporte` (US-10) para los unitarios.
 *
 * `TransaccionesSoporteEnMemoria` + `MensajesSoporteEnMemoria` reproducen lo
 * que importa del adaptador real:
 *
 *  - `tx` obligatorio en todo (rechazan sin él);
 *  - las ESCRITURAS (`insertar`, `guardarEnvio`) se aplican al CONFIRMAR la
 *    transacción y se descartan si revierte (o si el commit falla a
 *    propósito, `fallarProximoCommit`);
 *  - el reclamo bloquea la fila hasta el fin de su transacción y salta las
 *    bloqueadas (`SKIP LOCKED`); `guardarEnvio` solo escribe sobre una fila
 *    `pendiente` y lanza si no (como el `WHERE` del adaptador);
 *  - lo que devuelven son copias: mutar un mensaje no toca la "base" hasta
 *    `guardarEnvio` + commit.
 *
 * Lo que NO reproduce: la concurrencia real entre procesos (se prueba contra
 * Postgres en `soporte/integration`).
 */

/** Contexto de una transacción en memoria. */
export class TxSoporteEnMemoria {
  readonly alConfirmar: (() => void)[] = [];
  readonly bloqueadas = new Set<string>();

  constructor(readonly numero: number) {}
}

export class TransaccionesSoporteEnMemoria extends TransactionRunner {
  abiertas = 0;
  confirmadas = 0;
  revertidas = 0;
  /** El próximo commit falla DESPUÉS de correr el trabajo (y lo revierte). */
  fallarProximoCommit: Error | null = null;
  private readonly alTerminar: ((tx: TxSoporteEnMemoria) => void)[] = [];

  /** Lo llama el repositorio para soltar sus bloqueos al terminar. */
  registrarFin(soltar: (tx: TxSoporteEnMemoria) => void): void {
    this.alTerminar.push(soltar);
  }

  async run<T>(work: (tx: TransactionContext) => Promise<T>): Promise<T> {
    this.abiertas++;
    const tx = new TxSoporteEnMemoria(this.abiertas);
    try {
      const resultado = await work(tx);
      if (this.fallarProximoCommit) {
        const error = this.fallarProximoCommit;
        this.fallarProximoCommit = null;
        throw error;
      }
      for (const aplicar of tx.alConfirmar) aplicar();
      this.confirmadas++;
      return resultado;
    } catch (error: unknown) {
      this.revertidas++;
      throw error;
    } finally {
      for (const soltar of this.alTerminar) soltar(tx);
    }
  }
}

/** Copia de los datos de un mensaje (para guardar o devolver). */
export function datosDe(mensaje: MensajeSoporte): DatosMensajeSoporte {
  return {
    id: mensaje.id,
    tenantId: mensaje.tenantId,
    usuarioId: mensaje.usuarioId,
    categoria: mensaje.categoria,
    mensaje: mensaje.mensaje,
    estadoEnvio: mensaje.estadoEnvio,
    intentos: mensaje.intentos,
    proximoIntentoEn: copiaFecha(mensaje.proximoIntentoEn),
    ultimoError: mensaje.ultimoError,
    proveedor: mensaje.proveedor,
    proveedorMensajeId: mensaje.proveedorMensajeId,
    enviadoEn: mensaje.enviadoEn ? copiaFecha(mensaje.enviadoEn) : null,
    creadoEn: copiaFecha(mensaje.creadoEn),
  };
}

function copiaFecha(fecha: Date): Date {
  return new Date(fecha.getTime());
}

function exigirTx(
  tx: TransactionContext,
  operacion: string,
): TxSoporteEnMemoria {
  if (!(tx instanceof TxSoporteEnMemoria)) {
    throw new Error(
      `MensajesSoporteEnMemoria.${operacion} requiere una transacción`,
    );
  }
  return tx;
}

export class MensajesSoporteEnMemoria extends MensajeSoporteRepository {
  /** Filas CONFIRMADAS, por id. */
  readonly filas = new Map<string, DatosMensajeSoporte>();
  /** Qué transacción tiene bloqueada cada fila. */
  private readonly bloqueos = new Map<string, TxSoporteEnMemoria>();
  private secuencia = 0;
  /** Para observar: cada `contarCreadosDesde(tenantId, desde)` recibido. */
  readonly conteos: { tenantId: string; desde: Date }[] = [];
  /** Para observar: cada `reclamarSiguientePendiente(ahora)` recibido. */
  readonly reclamos: Date[] = [];

  constructor(
    transacciones: TransaccionesSoporteEnMemoria,
    /** El `now()` de la base: `creado_en` y `proximo_intento_en` al insertar. */
    private readonly ahoraBase: () => Date = () => new Date(),
  ) {
    super();
    transacciones.registrarFin((tx) => {
      for (const [id, tomadaPor] of this.bloqueos) {
        if (tomadaPor === tx) this.bloqueos.delete(id);
      }
    });
  }

  /** Inserta una fila confirmada (estado inicial a gusto). Devuelve su id. */
  sembrar(datos: Omit<DatosMensajeSoporte, 'id'> & { id?: string }): string {
    const id = datos.id ?? this.nuevoId();
    this.filas.set(id, { ...datos, id });
    return id;
  }

  /** El mensaje confirmado con ese id (copia), o falla. */
  leer(id: string): MensajeSoporte {
    const fila = this.filas.get(id);
    if (!fila) throw new Error(`mensaje ${id} no existe`);
    return MensajeSoporte.reconstituir(structuredClone(fila));
  }

  insertar(
    mensaje: MensajeSoporte,
    tx: TransactionContext,
  ): Promise<MensajeSoporte> {
    const t = exigirTx(tx, 'insertar');
    if (mensaje.estaGuardado() || !mensaje.estaPendiente()) {
      return Promise.reject(
        new Error('insertar: solo un mensaje recién creado (pendiente)'),
      );
    }
    const ahora = this.ahoraBase();
    const fila: DatosMensajeSoporte = {
      id: this.nuevoId(),
      tenantId: mensaje.tenantId,
      usuarioId: mensaje.usuarioId,
      categoria: mensaje.categoria,
      mensaje: mensaje.mensaje,
      estadoEnvio: EstadoEnvioSoporte.PENDIENTE,
      intentos: 0,
      proximoIntentoEn: copiaFecha(ahora),
      ultimoError: null,
      proveedor: null,
      proveedorMensajeId: null,
      enviadoEn: null,
      creadoEn: copiaFecha(ahora),
    };
    t.alConfirmar.push(() => this.filas.set(fila.id, structuredClone(fila)));
    return Promise.resolve(MensajeSoporte.reconstituir(structuredClone(fila)));
  }

  contarCreadosDesde(
    tenantId: string,
    desde: Date,
    tx: TransactionContext,
  ): Promise<number> {
    exigirTx(tx, 'contarCreadosDesde');
    this.conteos.push({ tenantId, desde: copiaFecha(desde) });
    return Promise.resolve(
      [...this.filas.values()].filter(
        (f) =>
          f.tenantId === tenantId && f.creadoEn.getTime() >= desde.getTime(),
      ).length,
    );
  }

  reclamarSiguientePendiente(
    ahora: Date,
    tx: TransactionContext,
  ): Promise<MensajeSoporte | null> {
    const t = exigirTx(tx, 'reclamarSiguientePendiente');
    this.reclamos.push(copiaFecha(ahora));
    const [fila] = [...this.filas.values()]
      .filter(
        (f) =>
          f.estadoEnvio === EstadoEnvioSoporte.PENDIENTE &&
          f.proximoIntentoEn.getTime() <= ahora.getTime() &&
          !this.bloqueos.has(f.id),
      )
      .sort(
        (a, b) =>
          a.proximoIntentoEn.getTime() - b.proximoIntentoEn.getTime() ||
          a.id.localeCompare(b.id),
      );
    if (!fila) return Promise.resolve(null);
    this.bloqueos.set(fila.id, t);
    t.bloqueadas.add(fila.id);
    return Promise.resolve(MensajeSoporte.reconstituir(structuredClone(fila)));
  }

  bloquearPorId(
    id: string,
    tx: TransactionContext,
  ): Promise<MensajeSoporte | null> {
    const t = exigirTx(tx, 'bloquearPorId');
    const tomadaPor = this.bloqueos.get(id);
    if (tomadaPor && tomadaPor !== t) {
      // En Postgres esperaría; en estas pruebas (secuenciales) es un error.
      return Promise.reject(new Error(`bloquearPorId: ${id} está tomado`));
    }
    const fila = this.filas.get(id);
    if (!fila) return Promise.resolve(null);
    this.bloqueos.set(id, t);
    t.bloqueadas.add(id);
    return Promise.resolve(MensajeSoporte.reconstituir(structuredClone(fila)));
  }

  guardarEnvio(mensaje: MensajeSoporte, tx: TransactionContext): Promise<void> {
    const t = exigirTx(tx, 'guardarEnvio');
    const actual = this.filas.get(mensaje.id);
    if (
      !actual ||
      actual.tenantId !== mensaje.tenantId ||
      actual.estadoEnvio !== EstadoEnvioSoporte.PENDIENTE
    ) {
      return Promise.reject(
        new Error(
          `guardarEnvio: el mensaje ${mensaje.id} no existe o ya no está pendiente`,
        ),
      );
    }
    const nuevo = datosDe(mensaje);
    t.alConfirmar.push(() => this.filas.set(nuevo.id, nuevo));
    return Promise.resolve();
  }

  private nuevoId(): string {
    this.secuencia++;
    return `5e000000-0000-4000-8000-${String(this.secuencia).padStart(12, '0')}`;
  }
}
