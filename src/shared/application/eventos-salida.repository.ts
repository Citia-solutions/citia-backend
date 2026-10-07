import { PoliticaReintentoSalida } from './politica-reintento-salida';
import { EventoDominio } from './publicador-eventos';
import { TransactionContext } from './transaction-runner';

/**
 * Puerto del outbox `eventos_salida` (ADR-12 §1–§3).
 *
 * Lo usan solo piezas de infraestructura compartida: el publicador (escribe) y
 * el despachador / la purga (leen y actualizan). Ningún caso de uso de negocio
 * debería inyectarlo: publican a través de `PublicadorEventos`.
 *
 * TODOS los métodos exigen `tx`:
 *  - `insertar`: la fila tiene que confirmarse con el cambio de negocio, en su
 *    misma transacción (ADR-12 §2). Sin `tx` no hay atomicidad.
 *  - el resto bloquea filas o toma un candado consultivo, y eso solo tiene
 *    sentido dentro de una transacción.
 * El adaptador lanza si recibe `undefined` en lugar de caer en silencio a una
 * conexión sin transacción.
 *
 * Los métodos marcados BARRIDO GLOBAL no filtran por tenant (ADR-12 §6): solo
 * los invoca el planificador y nunca se exponen por HTTP. Una vez tomada la
 * fila, todo lo que siga debe usar su `tenantId`.
 */
export enum EstadoEventoSalida {
  PENDIENTE = 'pendiente',
  ENTREGADO = 'entregado',
  FALLIDO = 'fallido',
}

/** Un hecho tal como está guardado en el outbox. */
export interface EventoSalida extends EventoDominio {
  // Id del hecho; es el que recibe el suscriptor (`EventoDominio & { id }`).
  id: string;
  estado: EstadoEventoSalida;
  intentos: number;
  proximoIntentoEn: Date;
  ultimoError: string | null;
  entregadoEn: Date | null;
  creadoEn: Date;
}

export interface ResultadoPurgaSalida {
  /**
   * `false` si otro proceso tenía el candado consultivo de la purga: esta vez
   * no se borró nada y no es un error (lo hará el otro).
   */
  ejecutada: boolean;
  borrados: number;
}

export abstract class EventosSalidaRepository {
  /**
   * Escribe el hecho como `pendiente`, listo para entregarse ya. Genera y
   * devuelve su id. Debe correr en la transacción del cambio de negocio.
   */
  abstract insertar(
    evento: EventoDominio,
    tx: TransactionContext,
  ): Promise<string>;

  // BARRIDO GLOBAL (ADR-12 §6)
  /**
   * Toma y BLOQUEA el pendiente más antiguo (`ocurrido_en`, `id`) cuyo
   * `proximo_intento_en <= ahora`, saltando los que otro proceso ya tiene
   * bloqueados (`FOR UPDATE SKIP LOCKED`). `null` si no queda ninguno libre.
   *
   * El bloqueo dura hasta el fin de `tx`: los suscriptores y `marcarEntregado`
   * deben correr en ese mismo `tx`.
   */
  abstract reclamarProximoPendiente(
    ahora: Date,
    tx: TransactionContext,
  ): Promise<EventoSalida | null>;

  // BARRIDO GLOBAL (ADR-12 §6)
  /**
   * `pendiente` → `entregado`. Se llama en el mismo `tx` del reclamo, después
   * de que todos los suscriptores terminaron. `false` si el hecho ya no estaba
   * pendiente (no debería pasar con la fila bloqueada).
   */
  abstract marcarEntregado(
    id: string,
    ahora: Date,
    tx: TransactionContext,
  ): Promise<boolean>;

  // BARRIDO GLOBAL (ADR-12 §6)
  /**
   * Registra un intento fallido, en una transacción APARTE de la que se
   * revirtió:
   *  - `intentos + 1` y `ultimo_error` (truncado; debe ser un código o mensaje
   *    corto, nunca datos personales);
   *  - si se llega a `politica.maxIntentos` → `fallido` (carta muerta);
   *  - si no → `proximo_intento_en = ahora + espera creciente`.
   *
   * Bloquea la fila (espera si otro proceso la tiene tomada). Devuelve el hecho
   * actualizado, o `null` si ya no estaba pendiente (p. ej. otro proceso lo
   * entregó entretanto). Si vuelve con `estado = fallido`, quien llama emite la
   * alerta `eventos_salida.fallido` (ADR-13 §16).
   */
  abstract registrarFallo(
    id: string,
    error: string,
    ahora: Date,
    politica: PoliticaReintentoSalida,
    tx: TransactionContext,
  ): Promise<EventoSalida | null>;

  // BARRIDO GLOBAL (ADR-12 §6)
  /**
   * Borra los `entregado` cuyo `entregado_en` es anterior a
   * `ahora - retencionDias` (`EVENTOS_SALIDA_RETENCION_DIAS`, 14). Los
   * `pendiente` y `fallido` nunca se borran.
   *
   * Toma un candado consultivo de transacción para que dos procesos no purguen
   * a la vez (ADR-12 §5); si lo tiene otro, no hace nada.
   */
  abstract purgarEntregadosAntiguos(
    ahora: Date,
    retencionDias: number,
    tx: TransactionContext,
  ): Promise<ResultadoPurgaSalida>;
}
