import {
  AlertaRecordatorios,
  BitacoraRecordatorios,
  EntradaBitacora,
} from '../../src/modules/recordatorio/application/bitacora-recordatorios';
import {
  CanalMensajeria,
  MensajeSaliente,
  ResultadoEnvio,
  TipoResultadoEnvio,
} from '../../src/modules/recordatorio/domain/canal-mensajeria';
import { MotivoRecordatorio } from '../../src/modules/recordatorio/domain/recordatorio.entity';

/**
 * `CanalMensajeria` falso para los unitarios del envío (ADR-13 §8): guarda
 * cada mensaje y responde lo que se le programe, en orden. Sin respuestas
 * programadas, `aceptado` con un id derivado de la clave de idempotencia.
 */
export class CanalMensajeriaFalso extends CanalMensajeria {
  readonly enviados: MensajeSaliente[] = [];
  private readonly respuestas: (
    | ResultadoEnvio
    | Error
    | (() => Promise<ResultadoEnvio>)
  )[] = [];

  /** Programa la próxima respuesta (o un error que lanzar, o una función). */
  responder(
    ...respuestas: (ResultadoEnvio | Error | (() => Promise<ResultadoEnvio>))[]
  ): this {
    this.respuestas.push(...respuestas);
    return this;
  }

  enviar(mensaje: MensajeSaliente): Promise<ResultadoEnvio> {
    this.enviados.push(mensaje);
    const siguiente = this.respuestas.shift();
    if (siguiente === undefined) {
      return Promise.resolve(aceptado(`msg_${mensaje.claveIdempotencia}`));
    }
    if (siguiente instanceof Error) return Promise.reject(siguiente);
    if (typeof siguiente === 'function') return siguiente();
    return Promise.resolve(siguiente);
  }
}

/** Respuestas de cada tipo, para no repetirlas en los tests. */
export const aceptado = (proveedorMensajeId = 'msg_1'): ResultadoEnvio => ({
  tipo: TipoResultadoEnvio.ACEPTADO,
  proveedor: 'falso',
  proveedorMensajeId,
});
export const transitorio = (codigo = 'application_error'): ResultadoEnvio => ({
  tipo: TipoResultadoEnvio.TRANSITORIO,
  proveedor: 'falso',
  codigo,
});
export const cuotaAgotada = (
  alcance: 'dia' | 'mes' = 'dia',
): ResultadoEnvio => ({
  tipo: TipoResultadoEnvio.CUOTA_AGOTADA,
  proveedor: 'falso',
  codigo: alcance === 'dia' ? 'daily_quota_exceeded' : 'monthly_quota_exceeded',
  alcance,
});
export const permanente = (
  motivo:
    | MotivoRecordatorio.CORREO_INVALIDO
    | MotivoRecordatorio.RECHAZADO = MotivoRecordatorio.CORREO_INVALIDO,
): ResultadoEnvio => ({
  tipo: TipoResultadoEnvio.PERMANENTE,
  proveedor: 'falso',
  codigo: 'validation_error:to',
  motivo,
});
export const configuracion = (codigo = 'invalid_api_key'): ResultadoEnvio => ({
  tipo: TipoResultadoEnvio.CONFIGURACION,
  proveedor: 'falso',
  codigo,
});
export const posibleDuplicado = (): ResultadoEnvio => ({
  tipo: TipoResultadoEnvio.POSIBLE_DUPLICADO,
  proveedor: 'falso',
  codigo: 'invalid_idempotent_request',
});

/** `BitacoraRecordatorios` que acumula las entradas para inspeccionarlas. */
export class BitacoraEnMemoria extends BitacoraRecordatorios {
  readonly entradas: EntradaBitacora[] = [];

  registrar(entrada: EntradaBitacora): void {
    this.entradas.push(entrada);
  }

  /** Entradas con ese `evento`. */
  de(evento: string): EntradaBitacora[] {
    return this.entradas.filter((e) => e.evento === evento);
  }

  /** Entradas con ese campo `alerta`. */
  alertas(alerta: AlertaRecordatorios): EntradaBitacora[] {
    return this.entradas.filter((e) => e.alerta === alerta);
  }

  /** Todo lo registrado, serializado: para buscar datos que no deben estar. */
  comoTexto(): string {
    return JSON.stringify(this.entradas);
  }
}
