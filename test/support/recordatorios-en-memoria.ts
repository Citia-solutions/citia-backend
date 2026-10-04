import { randomUUID } from 'node:crypto';

import { TransactionContext } from '../../src/shared/application/transaction-runner';
import { truncarError } from '../../src/shared/infrastructure/salida/typeorm-eventos-salida.repository';
import { ESTADOS_VIGENTES } from '../../src/modules/cita/domain/cita.entity';
import {
  ConfiguracionRecordatorioGuardada,
  ConfiguracionRecordatorioRepository,
  DatosConfiguracionRecordatorio,
} from '../../src/modules/recordatorio/domain/configuracion-recordatorio.repository';
import { FORMATO_HASH_CORREO } from '../../src/modules/recordatorio/domain/hash-correo';
import {
  CitaLeida,
  ConsultaCitasSinRecordatorio,
  DatosEnvioCita,
  LectorCitas,
} from '../../src/modules/recordatorio/domain/lector-citas';
import {
  CanalRecordatorio,
  EstadoRecordatorio,
  MotivoCancelacion,
  MotivoOmision,
  MotivoRecordatorio,
} from '../../src/modules/recordatorio/domain/recordatorio.entity';
import {
  ConteoDesenlaces,
  DatosRecordatorio,
  EnvioAceptado,
  EventoEntrega,
  FalloEnvio,
  LocalizadorEntrega,
  NuevoRecordatorio,
  RecordatorioRepository,
  ReintentoEnvio,
  ResultadoEventoEntrega,
  TipoEventoEntrega,
} from '../../src/modules/recordatorio/domain/recordatorio.repository';
import {
  NuevaSupresion,
  SupresionCorreoRepository,
} from '../../src/modules/recordatorio/domain/supresion-correo.repository';
import { esUuid } from '../../src/modules/recordatorio/infrastructure/persistence/soporte-sql';

/**
 * Dobles EN MEMORIA de los cuatro puertos del módulo `recordatorio`
 * (ADR-13 §2; paso 7), para unitarios y e2e sin base de datos.
 *
 * Reproducen el CONTRATO de cada adaptador TypeORM:
 *  - `tx` obligatorio en todos los métodos (rechazan sin él);
 *  - filtro por tenant donde el adaptador lo tiene, y los BARRIDOS GLOBALES
 *    sin él;
 *  - la clave única PARCIAL `(cita, canal, antelación, programado_para)` sin
 *    contar los `cancelado`, con `ON CONFLICT DO NOTHING` (también dentro del
 *    mismo lote);
 *  - las guardas de estado de las escrituras (solo desde `programado`) y los
 *    eventos de entrega monótonos;
 *  - el orden de las listas;
 *  - ids que no son UUID → "no existe".
 *
 * Lo que NO reproducen: `FOR UPDATE SKIP LOCKED`, el candado consultivo (solo
 * se registra la llamada) ni la reversión de una transacción. Eso se prueba
 * contra Postgres.
 *
 * Guardan y devuelven COPIAS, como una base real.
 */

function exigirTx(
  tx: TransactionContext,
  puerto: string,
  operacion: string,
): void {
  if (!tx) {
    throw new Error(
      `${puerto}.${operacion} requiere una transacción (ADR-12, ADR-13)`,
    );
  }
}

/**
 * Corre `trabajo` como lo haría el adaptador: exige `tx` y convierte lo que
 * lance en una promesa rechazada (nunca lanza de forma síncrona).
 */
function conTx<T>(
  puerto: string,
  operacion: string,
  tx: TransactionContext,
  trabajo: () => T,
): Promise<T> {
  try {
    exigirTx(tx, puerto, operacion);
    return Promise.resolve(trabajo());
  } catch (error: unknown) {
    return Promise.reject(
      error instanceof Error ? error : new Error(String(error)),
    );
  }
}

function copiar(r: DatosRecordatorio): DatosRecordatorio {
  return { ...r };
}

const ms = (d: Date): number => d.getTime();

/** Una llamada a un puerto, para comprobar orden y transacción. */
export interface LlamadaPuerto {
  operacion: string;
  tx: TransactionContext;
}

export class RecordatorioRepositoryEnMemoria extends RecordatorioRepository {
  private readonly filas = new Map<string, DatosRecordatorio>();
  /** Todas las llamadas, en orden. */
  readonly llamadas: LlamadaPuerto[] = [];
  /** Citas bloqueadas con `bloquearCitaParaReconciliar`, en orden. */
  readonly candados: { citaId: string; tx: TransactionContext }[] = [];

  /** Reloj de `creadoEn` / `actualizadoEn` (los pone la base en el adaptador). */
  constructor(private readonly relojAuditoria: () => Date = () => new Date()) {
    super();
  }

  /** Siembra una fila tal cual (con valores por defecto para lo que falte). */
  sembrar(
    datos: Pick<
      DatosRecordatorio,
      'tenantId' | 'citaId' | 'antelacionMin' | 'inicioCita' | 'programadoPara'
    > &
      Partial<DatosRecordatorio>,
  ): DatosRecordatorio {
    const ahora = this.relojAuditoria();
    const fila: DatosRecordatorio = {
      id: randomUUID(),
      canal: CanalRecordatorio.EMAIL,
      venceEn: datos.inicioCita,
      estado: EstadoRecordatorio.PROGRAMADO,
      motivo: null,
      intentos: 0,
      proximoIntentoEn: datos.programadoPara,
      ultimoError: null,
      proveedor: null,
      proveedorMensajeId: null,
      enviadoEn: null,
      entregadoEn: null,
      quejaEn: null,
      creadoEn: ahora,
      actualizadoEn: ahora,
      ...datos,
    };
    this.filas.set(fila.id, copiar(fila));
    return copiar(fila);
  }

  /** Todas las filas (copias), en orden de inserción. */
  todos(): DatosRecordatorio[] {
    return [...this.filas.values()].map(copiar);
  }

  buscar(id: string): DatosRecordatorio | null {
    const fila = this.filas.get(id);
    return fila ? copiar(fila) : null;
  }

  bloquearCitaParaReconciliar(
    citaId: string,
    tx: TransactionContext,
  ): Promise<void> {
    return this.ejecutar('bloquearCitaParaReconciliar', tx, () => {
      this.candados.push({ citaId, tx });
    });
  }

  insertarSiNoExisten(
    nuevos: readonly NuevoRecordatorio[],
    tx: TransactionContext,
  ): Promise<DatosRecordatorio[]> {
    return this.ejecutar('insertarSiNoExisten', tx, () => {
      const insertados: DatosRecordatorio[] = [];
      for (const nuevo of nuevos) {
        const estado = nuevo.estado as EstadoRecordatorio;
        if (
          estado !== EstadoRecordatorio.PROGRAMADO &&
          estado !== EstadoRecordatorio.OMITIDO
        ) {
          throw new Error(
            `insertarSiNoExisten: un recordatorio nace programado u omitido (recibido ${String(estado)})`,
          );
        }
        if (this.chocaConLaClave(nuevo)) continue;
        const ahora = this.relojAuditoria();
        const fila: DatosRecordatorio = {
          id: randomUUID(),
          tenantId: nuevo.tenantId,
          citaId: nuevo.citaId,
          canal: nuevo.canal,
          antelacionMin: nuevo.antelacionMin,
          inicioCita: nuevo.inicioCita,
          programadoPara: nuevo.programadoPara,
          venceEn: nuevo.venceEn,
          estado: nuevo.estado,
          motivo: nuevo.motivo,
          intentos: 0,
          proximoIntentoEn: nuevo.proximoIntentoEn,
          ultimoError: null,
          proveedor: null,
          proveedorMensajeId: null,
          enviadoEn: null,
          entregadoEn: null,
          quejaEn: null,
          creadoEn: ahora,
          actualizadoEn: ahora,
        };
        this.filas.set(fila.id, fila);
        insertados.push(copiar(fila));
      }
      return insertados;
    });
  }

  listarVigentesDeCita(
    citaId: string,
    tenantId: string,
    tx: TransactionContext,
  ): Promise<DatosRecordatorio[]> {
    return this.ejecutar('listarVigentesDeCita', tx, () =>
      esUuid(citaId)
        ? this.deCita(citaId, tenantId)
            .filter((r) => r.estado !== EstadoRecordatorio.CANCELADO)
            .sort(
              (a, b) =>
                ms(a.programadoPara) - ms(b.programadoPara) ||
                a.id.localeCompare(b.id),
            )
            .map(copiar)
        : [],
    );
  }

  listarPorCita(
    citaId: string,
    tenantId: string,
    tx: TransactionContext,
  ): Promise<DatosRecordatorio[]> {
    return this.ejecutar('listarPorCita', tx, () =>
      esUuid(citaId)
        ? this.deCita(citaId, tenantId)
            .sort(
              (a, b) =>
                ms(a.programadoPara) - ms(b.programadoPara) ||
                ms(a.creadoEn) - ms(b.creadoEn) ||
                a.id.localeCompare(b.id),
            )
            .map(copiar)
        : [],
    );
  }

  anular(
    ids: readonly string[],
    tenantId: string,
    motivo: MotivoCancelacion,
    tx: TransactionContext,
  ): Promise<string[]> {
    return this.ejecutar('anular', tx, () => {
      const anulados: string[] = [];
      for (const id of ids) {
        if (
          this.actualizarProgramado(id, tenantId, {
            estado: EstadoRecordatorio.CANCELADO,
            motivo,
          })
        ) {
          anulados.push(id);
        }
      }
      return anulados;
    });
  }

  // BARRIDO GLOBAL (ADR-12 §6)
  reclamarProximoProgramado(
    ahora: Date,
    tx: TransactionContext,
  ): Promise<DatosRecordatorio | null> {
    return this.ejecutar('reclamarProximoProgramado', tx, () => {
      const [primero] = [...this.filas.values()]
        .filter(
          (r) =>
            r.estado === EstadoRecordatorio.PROGRAMADO &&
            ms(r.proximoIntentoEn) <= ms(ahora),
        )
        .sort(
          (a, b) =>
            ms(a.proximoIntentoEn) - ms(b.proximoIntentoEn) ||
            a.id.localeCompare(b.id),
        );
      return primero ? copiar(primero) : null;
    });
  }

  registrarEnvio(
    id: string,
    tenantId: string,
    envio: EnvioAceptado,
    ahora: Date,
    tx: TransactionContext,
  ): Promise<boolean> {
    return this.ejecutar('registrarEnvio', tx, () =>
      this.actualizarProgramado(id, tenantId, (r) => ({
        estado: EstadoRecordatorio.ENVIADO,
        enviadoEn: ahora,
        proveedor: envio.proveedor,
        proveedorMensajeId: envio.proveedorMensajeId,
        intentos: r.intentos + 1,
      })),
    );
  }

  registrarReintento(
    id: string,
    tenantId: string,
    reintento: ReintentoEnvio,
    tx: TransactionContext,
  ): Promise<boolean> {
    return this.ejecutar('registrarReintento', tx, () =>
      this.actualizarProgramado(id, tenantId, (r) => ({
        intentos: r.intentos + 1,
        ultimoError: truncarError(reintento.ultimoError),
        proximoIntentoEn: reintento.proximoIntentoEn,
      })),
    );
  }

  posponer(
    id: string,
    tenantId: string,
    proximoIntentoEn: Date,
    tx: TransactionContext,
  ): Promise<boolean> {
    return this.ejecutar('posponer', tx, () =>
      this.actualizarProgramado(id, tenantId, { proximoIntentoEn }),
    );
  }

  omitir(
    id: string,
    tenantId: string,
    motivo: MotivoOmision,
    tx: TransactionContext,
  ): Promise<boolean> {
    return this.ejecutar('omitir', tx, () =>
      this.actualizarProgramado(id, tenantId, {
        estado: EstadoRecordatorio.OMITIDO,
        motivo,
      }),
    );
  }

  registrarFallo(
    id: string,
    tenantId: string,
    fallo: FalloEnvio,
    tx: TransactionContext,
  ): Promise<boolean> {
    return this.ejecutar('registrarFallo', tx, () =>
      this.actualizarProgramado(id, tenantId, (r) => ({
        estado: EstadoRecordatorio.FALLIDO,
        motivo: fallo.motivo,
        ultimoError:
          fallo.ultimoError === null
            ? r.ultimoError
            : truncarError(fallo.ultimoError),
        intentos: r.intentos + (fallo.contarIntento ? 1 : 0),
      })),
    );
  }

  // SIN FILTRO DE TENANT: webhook (ADR-13 §10, ADR-12 §6)
  registrarEventoEntrega(
    localizador: LocalizadorEntrega,
    evento: EventoEntrega,
    tx: TransactionContext,
  ): Promise<ResultadoEventoEntrega> {
    return this.ejecutar('registrarEventoEntrega', tx, () => {
      const fila = this.localizar(localizador);
      if (!fila) return { recordatorio: null, aplicado: false };
      const cambio = cambioPorEvento(fila, evento);
      if (!cambio) return { recordatorio: copiar(fila), aplicado: false };
      Object.assign(fila, cambio, { actualizadoEn: this.relojAuditoria() });
      return { recordatorio: copiar(fila), aplicado: true };
    });
  }

  // BARRIDO GLOBAL (ADR-12 §6)
  contarEnviadosEntre(
    desde: Date,
    hasta: Date,
    tx: TransactionContext,
  ): Promise<number> {
    return this.ejecutar('contarEnviadosEntre', tx, () => {
      validarPeriodo(desde, hasta, 'contarEnviadosEntre');
      return [...this.filas.values()].filter((r) =>
        enPeriodo(r.enviadoEn, desde, hasta),
      ).length;
    });
  }

  contarEnviadosDeTenantEntre(
    tenantId: string,
    desde: Date,
    hasta: Date,
    tx: TransactionContext,
  ): Promise<number> {
    return this.ejecutar('contarEnviadosDeTenantEntre', tx, () => {
      validarPeriodo(desde, hasta, 'contarEnviadosDeTenantEntre');
      return [...this.filas.values()].filter(
        (r) => r.tenantId === tenantId && enPeriodo(r.enviadoEn, desde, hasta),
      ).length;
    });
  }

  // BARRIDO GLOBAL (ADR-12 §6)
  contarDesenlacesEntre(
    desde: Date,
    hasta: Date,
    tx: TransactionContext,
  ): Promise<ConteoDesenlaces> {
    return this.ejecutar('contarDesenlacesEntre', tx, () => {
      validarPeriodo(desde, hasta, 'contarDesenlacesEntre');
      const enRango = [...this.filas.values()].filter((r) =>
        enPeriodo(r.actualizadoEn, desde, hasta),
      );
      return {
        entregados: enRango.filter(
          (r) => r.estado === EstadoRecordatorio.ENTREGADO,
        ).length,
        fallidos: enRango.filter((r) => r.estado === EstadoRecordatorio.FALLIDO)
          .length,
      };
    });
  }

  /** Registra la llamada, exige `tx` y resuelve (o rechaza) como el adaptador. */
  private ejecutar<T>(
    operacion: string,
    tx: TransactionContext,
    trabajo: () => T,
  ): Promise<T> {
    return conTx('RecordatorioRepository', operacion, tx, () => {
      this.llamadas.push({ operacion, tx });
      return trabajo();
    });
  }

  private deCita(citaId: string, tenantId: string): DatosRecordatorio[] {
    return [...this.filas.values()].filter(
      (r) => r.citaId === citaId && r.tenantId === tenantId,
    );
  }

  private chocaConLaClave(nuevo: NuevoRecordatorio): boolean {
    return [...this.filas.values()].some(
      (r) =>
        r.estado !== EstadoRecordatorio.CANCELADO &&
        r.citaId === nuevo.citaId &&
        r.canal === nuevo.canal &&
        r.antelacionMin === nuevo.antelacionMin &&
        ms(r.programadoPara) === ms(nuevo.programadoPara),
    );
  }

  /** UPDATE con guarda `estado = 'programado'` y filtro de tenant. */
  private actualizarProgramado(
    id: string,
    tenantId: string,
    cambio:
      | Partial<DatosRecordatorio>
      | ((r: DatosRecordatorio) => Partial<DatosRecordatorio>),
  ): boolean {
    const fila = this.filas.get(id);
    if (
      !fila ||
      fila.tenantId !== tenantId ||
      fila.estado !== EstadoRecordatorio.PROGRAMADO
    ) {
      return false;
    }
    Object.assign(fila, typeof cambio === 'function' ? cambio(fila) : cambio, {
      actualizadoEn: this.relojAuditoria(),
    });
    return true;
  }

  private localizar(
    localizador: LocalizadorEntrega,
  ): DatosRecordatorio | undefined {
    if (esUuid(localizador.recordatorioId)) {
      const fila = this.filas.get(localizador.recordatorioId);
      if (fila) return fila;
    }
    if (localizador.proveedorMensajeId) {
      return [...this.filas.values()]
        .filter((r) => r.proveedorMensajeId === localizador.proveedorMensajeId)
        .sort(
          (a, b) => ms(a.creadoEn) - ms(b.creadoEn) || a.id.localeCompare(b.id),
        )[0];
    }
    return undefined;
  }
}

/** Mismas reglas monótonas que `sentenciaEventoEntrega` del adaptador. */
function cambioPorEvento(
  fila: DatosRecordatorio,
  evento: EventoEntrega,
): Partial<DatosRecordatorio> | null {
  const vivo =
    fila.estado === EstadoRecordatorio.PROGRAMADO ||
    fila.estado === EstadoRecordatorio.ENVIADO;
  switch (evento.tipo) {
    case TipoEventoEntrega.ENVIADO:
      if (!evento.proveedorMensajeId || fila.proveedorMensajeId !== null) {
        return null;
      }
      return {
        proveedorMensajeId: evento.proveedorMensajeId,
        proveedor: fila.proveedor ?? evento.proveedor,
      };
    case TipoEventoEntrega.ENTREGADO:
      if (!vivo) return null;
      return {
        estado: EstadoRecordatorio.ENTREGADO,
        entregadoEn: fila.entregadoEn ?? evento.ocurridoEn,
        enviadoEn: fila.enviadoEn ?? evento.ocurridoEn,
        proveedorMensajeId:
          fila.proveedorMensajeId ?? evento.proveedorMensajeId,
        proveedor: fila.proveedor ?? evento.proveedor,
      };
    case TipoEventoEntrega.REBOTADO:
    case TipoEventoEntrega.RECHAZADO:
      if (!vivo) return null;
      return {
        estado: EstadoRecordatorio.FALLIDO,
        motivo:
          evento.tipo === TipoEventoEntrega.REBOTADO
            ? MotivoRecordatorio.REBOTE
            : MotivoRecordatorio.RECHAZADO,
        enviadoEn: fila.enviadoEn ?? evento.ocurridoEn,
        proveedorMensajeId:
          fila.proveedorMensajeId ?? evento.proveedorMensajeId,
        proveedor: fila.proveedor ?? evento.proveedor,
      };
    case TipoEventoEntrega.QUEJA:
      return fila.quejaEn === null ? { quejaEn: evento.ocurridoEn } : null;
    default:
      return null;
  }
}

function validarPeriodo(desde: Date, hasta: Date, operacion: string): void {
  if (
    Number.isNaN(desde.getTime()) ||
    Number.isNaN(hasta.getTime()) ||
    desde.getTime() >= hasta.getTime()
  ) {
    throw new RangeError(`${operacion}: periodo inválido`);
  }
}

function enPeriodo(instante: Date | null, desde: Date, hasta: Date): boolean {
  return (
    instante !== null && ms(instante) >= ms(desde) && ms(instante) < ms(hasta)
  );
}

export class ConfiguracionRecordatorioRepositoryEnMemoria extends ConfiguracionRecordatorioRepository {
  private readonly filas = new Map<string, ConfiguracionRecordatorioGuardada>();
  readonly llamadas: LlamadaPuerto[] = [];

  /** Siembra la configuración de un profesional (upsert sin `tx`). */
  sembrar(
    datos: DatosConfiguracionRecordatorio,
  ): ConfiguracionRecordatorioGuardada {
    return this.upsert(datos);
  }

  obtener(
    tenantId: string,
    usuarioId: string,
    tx: TransactionContext,
  ): Promise<ConfiguracionRecordatorioGuardada | null> {
    return conTx('ConfiguracionRecordatorioRepository', 'obtener', tx, () => {
      this.llamadas.push({ operacion: 'obtener', tx });
      const fila = this.filas.get(clave(tenantId, usuarioId));
      return fila ? copiarConfiguracion(fila) : null;
    });
  }

  guardar(
    datos: DatosConfiguracionRecordatorio,
    tx: TransactionContext,
  ): Promise<ConfiguracionRecordatorioGuardada> {
    return conTx('ConfiguracionRecordatorioRepository', 'guardar', tx, () => {
      this.llamadas.push({ operacion: 'guardar', tx });
      return this.upsert(datos);
    });
  }

  private upsert(
    datos: DatosConfiguracionRecordatorio,
  ): ConfiguracionRecordatorioGuardada {
    const k = clave(datos.tenantId, datos.usuarioId);
    const anterior = this.filas.get(k);
    const ahora = new Date();
    const fila: ConfiguracionRecordatorioGuardada = {
      ...datos,
      antelacionesMin: [...datos.antelacionesMin],
      id: anterior?.id ?? randomUUID(),
      creadoEn: anterior?.creadoEn ?? ahora,
      actualizadoEn: ahora,
    };
    this.filas.set(k, fila);
    return copiarConfiguracion(fila);
  }
}

const clave = (tenantId: string, usuarioId: string): string =>
  `${tenantId}|${usuarioId}`;

function copiarConfiguracion(
  c: ConfiguracionRecordatorioGuardada,
): ConfiguracionRecordatorioGuardada {
  return { ...c, antelacionesMin: [...c.antelacionesMin] };
}

export class SupresionCorreoRepositoryEnMemoria extends SupresionCorreoRepository {
  readonly supresiones = new Map<string, NuevaSupresion & { creadoEn: Date }>();

  existe(correoHash: string, tx: TransactionContext): Promise<boolean> {
    return conTx('SupresionCorreoRepository', 'existe', tx, () => {
      exigirHash(correoHash, 'existe');
      return this.supresiones.has(correoHash);
    });
  }

  agregar(supresion: NuevaSupresion, tx: TransactionContext): Promise<boolean> {
    return conTx('SupresionCorreoRepository', 'agregar', tx, () => {
      exigirHash(supresion.correoHash, 'agregar');
      if (this.supresiones.has(supresion.correoHash)) {
        return false; // gana el primer motivo
      }
      this.supresiones.set(supresion.correoHash, {
        ...supresion,
        creadoEn: new Date(),
      });
      return true;
    });
  }
}

function exigirHash(valor: string, operacion: string): void {
  if (!FORMATO_HASH_CORREO.test(valor)) {
    // Como el adaptador: sin repetir el valor, por si fuera un correo en claro.
    throw new Error(
      `SupresionCorreoRepository.${operacion}: correoHash no es un SHA-256 hex`,
    );
  }
}

/** Datos del envío de una cita sembrada (lo que no es la cita). */
export type DatosEnvioSembrados = Omit<DatosEnvioCita, 'cita'>;

const ENVIO_POR_DEFECTO: DatosEnvioSembrados = {
  paciente: { correo: 'paciente@correo.cl', consentimiento: true },
  profesional: { nombreCompleto: 'Dra. Ana Pérez' },
  organizacion: { nombre: 'Centro de prueba' },
};

/** Una `CitaLeida` con valores por defecto; `vigente` sale del estado (ADR-04). */
export function citaLeida(
  datos: Pick<CitaLeida, 'tenantId' | 'usuarioId' | 'inicio'> &
    Partial<CitaLeida>,
): CitaLeida {
  const estado = datos.estado ?? 'pendiente';
  return {
    id: randomUUID(),
    pacienteId: randomUUID(),
    vigente: (ESTADOS_VIGENTES as readonly string[]).includes(estado),
    ...datos,
    estado,
  };
}

/**
 * Lector de solo lectura en memoria. Las citas se siembran y se mueven a mano
 * (`actualizarCita`) para simular reagendar, cancelar, etc.
 *
 * `listarVigentesSinRecordatorio` necesita el doble de recordatorios (para el
 * "sin ningún recordatorio para su inicio actual"): pásalo al construir.
 */
export class LectorCitasEnMemoria extends LectorCitas {
  private readonly citas = new Map<
    string,
    { cita: CitaLeida; envio: DatosEnvioSembrados }
  >();
  readonly llamadas: LlamadaPuerto[] = [];

  constructor(
    private readonly recordatorios?: RecordatorioRepositoryEnMemoria,
  ) {
    super();
  }

  sembrarCita(
    cita: CitaLeida,
    envio: Partial<DatosEnvioSembrados> = {},
  ): CitaLeida {
    this.citas.set(cita.id, {
      cita: { ...cita },
      envio: { ...ENVIO_POR_DEFECTO, ...envio },
    });
    return { ...cita };
  }

  /** Cambia la cita (p. ej. `{ inicio }` al reagendar, `{ estado, vigente }` al cancelar). */
  actualizarCita(citaId: string, cambios: Partial<CitaLeida>): CitaLeida {
    const actual = this.citas.get(citaId);
    if (!actual) throw new Error(`Cita ${citaId} no sembrada`);
    const estado = cambios.estado ?? actual.cita.estado;
    actual.cita = {
      ...actual.cita,
      vigente:
        cambios.estado !== undefined
          ? (ESTADOS_VIGENTES as readonly string[]).includes(estado)
          : actual.cita.vigente,
      ...cambios,
    };
    return { ...actual.cita };
  }

  obtenerCita(
    citaId: string,
    tenantId: string,
    tx: TransactionContext,
  ): Promise<CitaLeida | null> {
    return this.ejecutar('obtenerCita', tx, () => {
      const fila = esUuid(citaId) ? this.citas.get(citaId) : undefined;
      return fila && fila.cita.tenantId === tenantId ? { ...fila.cita } : null;
    });
  }

  obtenerDatosEnvio(
    citaId: string,
    tenantId: string,
    tx: TransactionContext,
  ): Promise<DatosEnvioCita | null> {
    return this.ejecutar('obtenerDatosEnvio', tx, () => {
      const fila = esUuid(citaId) ? this.citas.get(citaId) : undefined;
      if (!fila || fila.cita.tenantId !== tenantId) return null;
      const correo = fila.envio.paciente.correo?.trim() || null;
      return {
        cita: { ...fila.cita },
        paciente: { ...fila.envio.paciente, correo },
        profesional: { ...fila.envio.profesional },
        organizacion: { ...fila.envio.organizacion },
      };
    });
  }

  listarVigentesDeProfesionalDesde(
    tenantId: string,
    usuarioId: string,
    desde: Date,
    tx: TransactionContext,
  ): Promise<CitaLeida[]> {
    return this.ejecutar('listarVigentesDeProfesionalDesde', tx, () =>
      this.todas()
        .filter(
          (c) =>
            c.tenantId === tenantId &&
            c.usuarioId === usuarioId &&
            c.vigente &&
            ms(c.inicio) >= ms(desde),
        )
        .sort(porInicio),
    );
  }

  // BARRIDO GLOBAL (ADR-12 §6)
  listarVigentesSinRecordatorio(
    consulta: ConsultaCitasSinRecordatorio,
    tx: TransactionContext,
  ): Promise<CitaLeida[]> {
    return this.ejecutar('listarVigentesSinRecordatorio', tx, () => {
      if (!this.recordatorios) {
        throw new Error(
          'LectorCitasEnMemoria: pasa el RecordatorioRepositoryEnMemoria al construirlo',
        );
      }
      validarPeriodo(
        consulta.desde,
        consulta.hasta,
        'listarVigentesSinRecordatorio',
      );
      if (!Number.isInteger(consulta.limite) || consulta.limite <= 0) {
        throw new RangeError('listarVigentesSinRecordatorio: limite inválido');
      }
      const filas = this.recordatorios.todos();
      const cursor = consulta.despuesDe;
      return this.todas()
        .filter(
          (c) =>
            c.vigente &&
            ms(c.inicio) >= ms(consulta.desde) &&
            ms(c.inicio) < ms(consulta.hasta) &&
            !filas.some(
              (r) => r.citaId === c.id && ms(r.inicioCita) === ms(c.inicio),
            ) &&
            (!cursor ||
              ms(c.inicio) > ms(cursor.inicio) ||
              (ms(c.inicio) === ms(cursor.inicio) && c.id > cursor.id)),
        )
        .sort(porInicio)
        .slice(0, consulta.limite);
    });
  }

  private todas(): CitaLeida[] {
    return [...this.citas.values()].map((f) => ({ ...f.cita }));
  }

  private ejecutar<T>(
    operacion: string,
    tx: TransactionContext,
    trabajo: () => T,
  ): Promise<T> {
    return conTx('LectorCitas', operacion, tx, () => {
      this.llamadas.push({ operacion, tx });
      return trabajo();
    });
  }
}

// Mismo orden que el SQL: (inicio, id). El id se compara como texto, que para
// UUID en minúsculas coincide con el orden de Postgres.
function porInicio(a: CitaLeida, b: CitaLeida): number {
  return (
    ms(a.inicio) - ms(b.inicio) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}
