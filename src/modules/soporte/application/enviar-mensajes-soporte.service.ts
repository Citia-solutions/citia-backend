import type { PoliticaReintentoSalida } from '../../../shared/application/politica-reintento-salida';
import {
  TransactionContext,
  TransactionRunner,
} from '../../../shared/application/transaction-runner';
// Por archivo, sin importar `RecordatorioModule` (ADR-15 opción F2, DT-59):
// el puerto del canal y sus seis resultados (ADR-13 §8).
import {
  CanalMensajeria,
  MensajeSaliente,
  ResultadoEnvio,
  TipoResultadoEnvio,
} from '../../recordatorio/domain/canal-mensajeria';
import { ITenantRepository } from '../../tenant/domain/tenant.repository';
import { IUsuarioRepository } from '../../usuario/domain/usuario.repository';
import {
  ESPERA_CUOTA_AGOTADA_MS,
  POLITICA_REINTENTO_SOPORTE,
} from '../domain/limites-soporte';
import { MensajeSoporte } from '../domain/mensaje-soporte.entity';
import { MensajeSoporteRepository } from '../domain/mensaje-soporte.repository';
import { armarCorreoSoporte } from './plantilla-mensaje-soporte';

/**
 * Espera mínima entre dos llamadas al proveedor dentro de un tick (ADR-13
 * §7.5: Resend admite 2 por segundo por cuenta, que se comparte con los
 * recordatorios).
 */
export const PAUSA_ENTRE_ENVIOS_SOPORTE_MS = 500;
/**
 * Tope de una llamada al canal. El adaptador corta a los 10 s (ADR-13 §7);
 * este es la defensa del caso de uso, con margen, porque la fila queda
 * bloqueada mientras dura la llamada.
 */
export const TIEMPO_MAXIMO_ENVIO_SOPORTE_MS = 11_000;
/** Código del lote cortado porque falta `SOPORTE_CORREO_DESTINO`. */
export const CODIGO_SIN_DESTINO = 'sin_destino';

/** `Idempotency-Key` de un mensaje a soporte ante el proveedor (24 h en Resend). */
export function claveIdempotenciaSoporte(mensajeId: string): string {
  return `soporte/${mensajeId}`;
}

/** Configuración del envío (entorno). */
export interface ConfiguracionEnvioSoporte {
  /** `SOPORTE_CORREO_DESTINO`. Vacío = no se envía nada (`sin_destino`). */
  destino: string;
  /** `APP_TZ`: la fecha y hora de "Recibido" del correo. */
  tz: string;
  /** Por defecto `POLITICA_REINTENTO_SOPORTE`. */
  politica?: PoliticaReintentoSalida;
  pausaEntreEnviosMs?: number;
  tiempoMaximoEnvioMs?: number;
  /** En [0, 1): la variación de la espera de reintento. Para las pruebas. */
  aleatorio?: () => number;
}

export interface OpcionesEnvioSoporte {
  /** Mensajes como mucho en este tick (entero ≥ 1). */
  lote: number;
  /** Se consulta antes de reclamar cada mensaje: `false` corta (apagado ordenado). */
  continuar?: () => boolean;
}

/** Un mensaje que quedó `fallido` en este tick (para la alerta). */
export interface FalloEnvioSoporte {
  mensajeId: string;
  tenantId: string;
  /** Código del proveedor o nombre del error; nunca un mensaje ni el texto. */
  codigo: string;
}

export interface ResultadoEnvioSoporte {
  /** Mensajes reclamados. */
  procesados: number;
  enviados: number;
  /** Fallos que se reintentarán (transitorios o propios). */
  reintentos: number;
  /** Pospuestos 1 h por cuota agotada (sin gastar intento). */
  pospuestos: number;
  /** Los que pasaron a `fallido` en este tick. */
  fallidos: FalloEnvioSoporte[];
  /**
   * Errores PROPIOS (no del proveedor) en este tick: se revirtió la
   * transacción del mensaje y se registró el fallo aparte. También cuentan en
   * `reintentos` o `fallidos` según cómo quedó.
   */
  erroresInternos: FalloEnvioSoporte[];
  /** Código si se cortó el lote por configuración del proveedor (o `sin_destino`). */
  configuracion: string | null;
  /** Código si se cortó el lote por cuota agotada. */
  cuota: string | null;
  /** `true` si `continuar()` cortó el lote (apagado). */
  interrumpido: boolean;
}

/** Cómo terminó un mensaje reclamado. */
type Desenlace =
  | { tipo: 'enviado' }
  | { tipo: 'reintento' }
  | { tipo: 'pospuesto'; codigo: string }
  | { tipo: 'fallido'; codigo: string }
  | { tipo: 'configuracion'; codigo: string }
  | { tipo: 'sin_cambios' };

interface UnMensaje {
  mensaje: MensajeSoporte;
  desenlace: Desenlace;
  /** El error propio, si lo hubo (código). */
  errorInterno: string | null;
  llamoProveedor: boolean;
}

/**
 * Envío de los mensajes a soporte (US-10, ADR-15 §7), invocado por el job
 * `soporte.envio` cada minuto. BARRIDO GLOBAL (ADR-12 §6): la cola es de toda
 * la plataforma; tras tomar una fila, todo usa SU `tenantId`.
 *
 * Por cada mensaje, hasta `lote`, UNA transacción:
 *  1. `reclamarSiguientePendiente(ahora)` (`FOR UPDATE SKIP LOCKED`); sin fila,
 *     termina el lote.
 *  2. Lee el usuario (`IUsuarioRepository.findById`) y la organización
 *     (`ITenantRepository.findById`) por sus puertos.
 *  3. Arma el correo (`armarCorreoSoporte`, puro y escapado) y lo envía por
 *     `CanalMensajeria`: destinatario `destino`, `Reply-To` = correo del
 *     profesional (`null` si ya no existe), `Idempotency-Key = soporte/<id>`,
 *     etiqueta `mensaje_soporte_id`. La transacción queda abierta durante la
 *     llamada (≤ 11 s), con la fila bloqueada, como los recordatorios
 *     (ADR-13 §7): si Resend aceptó y el commit falla, el reintento lo
 *     absorbe la clave de idempotencia.
 *  4. Aplica el resultado (ADR-13 §8 según ADR-15 §7) y `guardarEnvio`:
 *
 * | Resultado            | Fila                                        | Lote      |
 * |----------------------|---------------------------------------------|-----------|
 * | `aceptado`           | `enviado` con id del proveedor              | sigue     |
 * | `posible_duplicado`  | `enviado` sin id                            | sigue     |
 * | `transitorio`        | `registrarFallo` (reintento; `fallido` al 8.º) | sigue  |
 * | `cuota_agotada`      | `posponer(ahora + 1 h)`, sin sumar intento  | se corta  |
 * | `permanente`         | `marcarFallido`                             | sigue     |
 * | `configuracion`      | no se toca (sigue `pendiente`)              | se corta  |
 * | error propio         | se revierte; en OTRA transacción `bloquearPorId` → `registrarFallo(nombre del error)` | sigue |
 *
 * El canal promete no lanzar por errores del proveedor: si lanza (o se pasa
 * del tope de tiempo) es un error propio. Si falla el RECLAMO mismo, o el
 * registro del error propio, es infraestructura: el error sube al
 * planificador.
 *
 * Sin `destino` no reclama nada (`configuracion = 'sin_destino'`): el job ni
 * siquiera se registra sin la variable, esto cubre una invocación a mano.
 *
 * No registra logs (no conoce Nest): devuelve el resultado y el planificador
 * lo registra, solo con ids, estados y códigos. Clase plana (ADR-02).
 */
export class EnviarMensajesSoporteService {
  private readonly politica: PoliticaReintentoSalida;
  private readonly pausaMs: number;
  private readonly tiempoMaximoMs: number;
  private readonly aleatorio: () => number;

  constructor(
    private readonly transacciones: TransactionRunner,
    private readonly mensajes: MensajeSoporteRepository,
    private readonly usuarios: IUsuarioRepository,
    private readonly tenants: ITenantRepository,
    private readonly canal: CanalMensajeria,
    private readonly configuracion: ConfiguracionEnvioSoporte,
    private readonly reloj: () => Date = () => new Date(),
    private readonly esperar: (ms: number) => Promise<void> = esperarMs,
  ) {
    this.politica = configuracion.politica ?? POLITICA_REINTENTO_SOPORTE;
    this.pausaMs =
      configuracion.pausaEntreEnviosMs ?? PAUSA_ENTRE_ENVIOS_SOPORTE_MS;
    this.tiempoMaximoMs =
      configuracion.tiempoMaximoEnvioMs ?? TIEMPO_MAXIMO_ENVIO_SOPORTE_MS;
    this.aleatorio = configuracion.aleatorio ?? Math.random;
  }

  /** `SOPORTE_CORREO_DESTINO` presente: hay a dónde enviar. */
  get tieneDestino(): boolean {
    return this.configuracion.destino.trim() !== '';
  }

  /**
   * Un tick: hasta `lote` mensajes, uno por transacción. Lanza SOLO si falla
   * la infraestructura (no se pudo reclamar ni registrar un error propio).
   */
  async ejecutar(
    opciones: OpcionesEnvioSoporte,
  ): Promise<ResultadoEnvioSoporte> {
    if (!Number.isInteger(opciones.lote) || opciones.lote < 1) {
      throw new RangeError(
        `EnviarMensajesSoporteService: el lote debe ser un entero ≥ 1 (llegó ${String(opciones.lote)})`,
      );
    }
    const continuar = opciones.continuar ?? (() => true);
    const resultado: ResultadoEnvioSoporte = {
      procesados: 0,
      enviados: 0,
      reintentos: 0,
      pospuestos: 0,
      fallidos: [],
      erroresInternos: [],
      configuracion: null,
      cuota: null,
      interrumpido: false,
    };
    if (!this.tieneDestino) {
      resultado.configuracion = CODIGO_SIN_DESTINO;
      return resultado;
    }

    let pausaPendiente = false;
    for (let i = 0; i < opciones.lote; i++) {
      if (!continuar()) {
        resultado.interrumpido = true;
        break;
      }
      if (pausaPendiente) {
        // Ritmo del proveedor, fuera de la transacción.
        await this.esperar(this.pausaMs);
        pausaPendiente = false;
      }

      const uno = await this.procesarSiguiente();
      if (uno === null) break;

      resultado.procesados++;
      pausaPendiente = uno.llamoProveedor;
      if (uno.errorInterno !== null) {
        resultado.erroresInternos.push(fallo(uno.mensaje, uno.errorInterno));
      }
      const d = uno.desenlace;
      switch (d.tipo) {
        case 'enviado':
          resultado.enviados++;
          break;
        case 'reintento':
          resultado.reintentos++;
          break;
        case 'pospuesto':
          resultado.pospuestos++;
          resultado.cuota = d.codigo;
          break;
        case 'fallido':
          resultado.fallidos.push(fallo(uno.mensaje, d.codigo));
          break;
        case 'configuracion':
          resultado.configuracion = d.codigo;
          break;
        case 'sin_cambios':
          break;
      }
      if (d.tipo === 'pospuesto' || d.tipo === 'configuracion') break;
    }
    return resultado;
  }

  /**
   * Reclama y procesa UN mensaje en su transacción; `null` si no queda
   * ninguno vencido y libre. Distingue el fallo del reclamo (sube) del fallo
   * de un mensaje ya reclamado (se registra aparte y el lote sigue).
   */
  private async procesarSiguiente(): Promise<UnMensaje | null> {
    // Fuera del callback: si la transacción falla, hay que saber si alcanzó a
    // reclamar un mensaje (y cuál).
    const tomado: { mensaje: MensajeSoporte | null; llamo: boolean } = {
      mensaje: null,
      llamo: false,
    };
    try {
      return await this.transacciones.run(async (tx) => {
        const mensaje = await this.mensajes.reclamarSiguientePendiente(
          this.reloj(),
          tx,
        );
        if (!mensaje) return null;
        tomado.mensaje = mensaje;
        return this.enviar(mensaje, tx, () => {
          tomado.llamo = true;
        });
      });
    } catch (error: unknown) {
      if (!tomado.mensaje) throw error; // ni siquiera se pudo reclamar
      return this.registrarErrorPropio(tomado.mensaje, error, tomado.llamo);
    }
  }

  private async enviar(
    mensaje: MensajeSoporte,
    tx: TransactionContext,
    alLlamar: () => void,
  ): Promise<UnMensaje> {
    const usuario = await this.usuarios.findById(
      mensaje.usuarioId,
      mensaje.tenantId,
      tx,
    );
    const organizacion = await this.tenants.findById(mensaje.tenantId, tx);
    const correo = armarCorreoSoporte(
      {
        mensaje,
        usuario: usuario
          ? {
              nombreCompleto: usuario.nombreCompleto,
              email: usuario.email,
              rol: usuario.rol,
            }
          : null,
        organizacion: organizacion
          ? { nombre: organizacion.nombre, slug: organizacion.slug }
          : null,
      },
      this.configuracion.tz,
    );
    const saliente: MensajeSaliente = {
      destinatario: this.configuracion.destino.trim(),
      asunto: correo.asunto,
      html: correo.html,
      texto: correo.texto,
      // Leído al enviar (T13): soporte contesta y le llega al profesional.
      responderA: usuario ? usuario.email.trim() || null : null,
      claveIdempotencia: claveIdempotenciaSoporte(mensaje.id),
      etiquetas: { mensaje_soporte_id: mensaje.id },
    };

    alLlamar();
    const resultado = await this.llamarCanal(saliente);
    const desenlace = this.aplicar(mensaje, resultado, this.reloj());
    if (desenlace.tipo !== 'configuracion') {
      await this.mensajes.guardarEnvio(mensaje, tx);
    }
    return { mensaje, desenlace, errorInterno: null, llamoProveedor: true };
  }

  /** La tabla de ADR-15 §7: muta el mensaje (salvo `configuracion`). */
  private aplicar(
    mensaje: MensajeSoporte,
    resultado: ResultadoEnvio,
    ahora: Date,
  ): Desenlace {
    switch (resultado.tipo) {
      case TipoResultadoEnvio.ACEPTADO:
        mensaje.marcarEnviado(
          resultado.proveedor,
          resultado.proveedorMensajeId,
          ahora,
        );
        return { tipo: 'enviado' };

      case TipoResultadoEnvio.POSIBLE_DUPLICADO:
        // Resend ya aceptó un envío con esta clave: el correo salió.
        mensaje.marcarEnviado(resultado.proveedor, null, ahora);
        return { tipo: 'enviado' };

      case TipoResultadoEnvio.TRANSITORIO:
        mensaje.registrarFallo(
          resultado.codigo,
          ahora,
          this.politica,
          this.aleatorio,
        );
        return mensaje.estaPendiente()
          ? { tipo: 'reintento' }
          : { tipo: 'fallido', codigo: resultado.codigo };

      case TipoResultadoEnvio.CUOTA_AGOTADA:
        mensaje.posponer(new Date(ahora.getTime() + ESPERA_CUOTA_AGOTADA_MS));
        return { tipo: 'pospuesto', codigo: resultado.codigo };

      case TipoResultadoEnvio.PERMANENTE:
        mensaje.marcarFallido(resultado.codigo);
        return { tipo: 'fallido', codigo: resultado.codigo };

      case TipoResultadoEnvio.CONFIGURACION:
        // No se toca la fila ni se suma intento: sigue `pendiente` con el
        // mismo próximo intento. Se corta el lote y se alerta.
        return { tipo: 'configuracion', codigo: resultado.codigo };
    }
  }

  /**
   * Llama al canal con tope de tiempo. El puerto promete no lanzar por
   * errores del proveedor: si lanza, o se pasa del tope, el error sube y se
   * trata como error propio (se revierte y se registra el fallo aparte).
   */
  private llamarCanal(saliente: MensajeSaliente): Promise<ResultadoEnvio> {
    return conTiempoLimite(this.canal.enviar(saliente), this.tiempoMaximoMs);
  }

  /**
   * Algo propio lanzó dentro de la transacción del mensaje (se revirtió). En
   * OTRA transacción: `bloquearPorId` → si sigue `pendiente`,
   * `registrarFallo(nombre del error)` → `guardarEnvio`. Así una fila rota no
   * vuelve a la cabeza de la cola en el mismo tick ni la traba para siempre
   * (al octavo fallo, `fallido`). Si esto también falla, es infraestructura y
   * se relanza el error ORIGINAL.
   */
  private async registrarErrorPropio(
    reclamado: MensajeSoporte,
    error: unknown,
    llamoProveedor: boolean,
  ): Promise<UnMensaje> {
    const codigo = nombreDeError(error);
    let desenlace: Desenlace;
    let mensaje = reclamado;
    try {
      desenlace = await this.transacciones.run(async (tx) => {
        const actual = await this.mensajes.bloquearPorId(reclamado.id, tx);
        if (!actual || !actual.estaPendiente()) {
          return { tipo: 'sin_cambios' } as const;
        }
        mensaje = actual;
        actual.registrarFallo(
          codigo,
          this.reloj(),
          this.politica,
          this.aleatorio,
        );
        await this.mensajes.guardarEnvio(actual, tx);
        return actual.estaPendiente()
          ? ({ tipo: 'reintento' } as const)
          : ({ tipo: 'fallido', codigo } as const);
      });
    } catch {
      throw error;
    }
    return { mensaje, desenlace, errorInterno: codigo, llamoProveedor };
  }
}

function fallo(mensaje: MensajeSoporte, codigo: string): FalloEnvioSoporte {
  return { mensajeId: mensaje.id, tenantId: mensaje.tenantId, codigo };
}

/**
 * El nombre del error, para `ultimo_error` y los logs. Nunca su mensaje
 * (puede traer datos). Si no es un nombre "limpio", `Error`.
 */
export function nombreDeError(error: unknown): string {
  if (typeof error !== 'object' || error === null) return 'Desconocido';
  const { name } = error as { name?: unknown };
  return typeof name === 'string' && /^\w{1,64}$/.test(name) ? name : 'Error';
}

class TiempoAgotadoEnvioSoporteError extends Error {
  constructor() {
    super('tiempo_agotado');
    this.name = 'TiempoAgotadoEnvioSoporteError';
  }
}

function esperarMs(ms: number): Promise<void> {
  return ms <= 0
    ? Promise.resolve()
    : new Promise((resolver) => setTimeout(resolver, ms));
}

/** Rechaza con `TiempoAgotadoEnvioSoporteError` si `promesa` tarda más de `ms`. */
function conTiempoLimite<T>(promesa: Promise<T>, ms: number): Promise<T> {
  let temporizador: ReturnType<typeof setTimeout> | undefined;
  const limite = new Promise<never>((_, rechazar) => {
    temporizador = setTimeout(
      () => rechazar(new TiempoAgotadoEnvioSoporteError()),
      ms,
    );
    temporizador.unref?.();
  });
  return Promise.race([promesa, limite]).finally(() =>
    clearTimeout(temporizador),
  );
}
