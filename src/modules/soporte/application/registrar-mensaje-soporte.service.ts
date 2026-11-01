import { TransactionRunner } from '../../../shared/application/transaction-runner';
import { TopeMensajesSoporteError } from '../domain/exceptions/tope-mensajes-soporte.error';
import {
  TOPE_MENSAJES_SOPORTE_24H,
  VENTANA_TOPE_SOPORTE_MS,
} from '../domain/limites-soporte';
import {
  CategoriaSoporte,
  MensajeSoporte,
} from '../domain/mensaje-soporte.entity';
import { MensajeSoporteRepository } from '../domain/mensaje-soporte.repository';

/** Quién escribe: SIEMPRE el usuario del token, nunca el cuerpo. */
export interface AutorMensajeSoporte {
  userId: string;
  tenantId: string;
}

/** Lo que llega del cuerpo de `POST /api/soporte/mensajes` (ya validado). */
export interface NuevoMensajeSoporte {
  /** Ausente o `null` → `otro`. */
  categoria?: CategoriaSoporte | null;
  mensaje: string;
}

/**
 * Registro de un mensaje a soporte (US-10, P7; ADR-15 §7).
 *
 * En UNA transacción: cuenta los mensajes de la organización desde
 * `ahora − 24 h`; con `TOPE_MENSAJES_SOPORTE_24H` (5) o más →
 * `TopeMensajesSoporteError` (429) sin insertar; si no, `MensajeSoporte.crear`
 * (recorta y valida 1 a 2000; `MensajeSoporteInvalidoError` → 400) e inserta
 * la fila `pendiente`.
 *
 * **No envía nada:** el correo lo manda el job `soporte.envio`
 * (`EnviarMensajesSoporteService`). La fila es el outbox de ese correo:
 * existe si y solo si esta transacción se confirmó.
 *
 * El tope es blando a propósito: dos peticiones simultáneas de la misma
 * organización pueden dejar 6 (no hay bloqueo por organización).
 *
 * Devuelve el mensaje guardado (con `id` y `creadoEn`); el controller arma la
 * respuesta y escribe el log (`soporte.mensaje_recibido`, sin el texto).
 * Clase plana (ADR-02): la arma `SoporteModule` con una fábrica.
 */
export class RegistrarMensajeSoporteService {
  constructor(
    private readonly transacciones: TransactionRunner,
    private readonly mensajes: MensajeSoporteRepository,
    private readonly reloj: () => Date = () => new Date(),
  ) {}

  async registrar(
    autor: AutorMensajeSoporte,
    nuevo: NuevoMensajeSoporte,
  ): Promise<MensajeSoporte> {
    // Valida antes de abrir la transacción: un texto inválido no cuenta ni
    // toca la base.
    const mensaje = MensajeSoporte.crear({
      tenantId: autor.tenantId,
      usuarioId: autor.userId,
      categoria: nuevo.categoria,
      mensaje: nuevo.mensaje,
    });
    const desde = new Date(this.reloj().getTime() - VENTANA_TOPE_SOPORTE_MS);

    return this.transacciones.run(async (tx) => {
      const recientes = await this.mensajes.contarCreadosDesde(
        autor.tenantId,
        desde,
        tx,
      );
      if (recientes >= TOPE_MENSAJES_SOPORTE_24H) {
        throw new TopeMensajesSoporteError();
      }
      return this.mensajes.insertar(mensaje, tx);
    });
  }
}
