import { TransactionContext } from '../../../shared/application/transaction-runner';
import { Cita, EstadoCita } from './cita.entity';

export abstract class CitaRepository {
  abstract guardar(cita: Cita, tx?: TransactionContext): Promise<Cita>;

  // Carga una cita del tenant. El filtro por tenantId es requisito de
  // seguridad: nadie puede tocar una cita de otra organizacion.
  abstract buscarPorId(
    id: string,
    tenantId: string,
    tx?: TransactionContext,
  ): Promise<Cita | null>;

  /**
   * Igual que `buscarPorId`, pero bloquea la fila (`SELECT … FOR NO KEY UPDATE`)
   * hasta que termine la transacción. Serializa las mutaciones concurrentes de
   * una cita (profesional, paciente por su enlace, bandeja al reagendar): la
   * segunda espera y relee el estado ya confirmado.
   *
   * `tx` es OBLIGATORIO: un bloqueo fuera de transacción no protege nada.
   */
  abstract buscarPorIdParaActualizar(
    id: string,
    tenantId: string,
    tx: TransactionContext,
  ): Promise<Cita | null>;

  /**
   * Carga en lote las citas del tenant cuyos ids están en `ids` (p. ej. la
   * cita de origen de cada solicitud de la bandeja, sin N+1). Sin bloqueo.
   * Los ids de otro tenant o inexistentes simplemente no vuelven: quien llama
   * no debe asumir ni orden ni que haya una por id. Con `ids` vacío devuelve
   * [] sin consultar.
   */
  abstract buscarPorIds(
    ids: readonly string[],
    tenantId: string,
    tx?: TransactionContext,
  ): Promise<Cita[]>;

  // Devuelve las citas del profesional (usuarioId) en el tenant, cuyo `inicio`
  // cae dentro del día `dia`, en orden cronológico ascendente por `inicio`.
  // El filtrado por tenantId + usuarioId es requisito de seguridad (aislamiento
  // multi-tenant y por profesional). `dia` se interpreta como la fecha del día
  // a consultar; el repositorio calcula el rango [00:00, día+1 00:00).
  abstract buscarDelDiaPorProfesional(
    tenantId: string,
    usuarioId: string,
    dia: Date,
    tx?: TransactionContext,
  ): Promise<Cita[]>;

  // Citas del profesional (usuarioId) en el tenant cuyo `inicio` cae en el
  // rango semiabierto [desde, hasta), ordenadas por `inicio ASC` y, a igual
  // inicio, `creadoEn ASC` (con solapamientos permitidos el orden debe ser
  // estable). `desde`/`hasta` son INSTANTES ya resueltos por quien llama: el
  // repositorio no interpreta zonas horarias ni dias calendario.
  //
  // `opciones.estados` restringe a esos estados; ausente = todos. Sirve a la
  // agenda por rango (sin filtro) y al pre-filtro de solapamientos (ADR-11 §2:
  // estados = ESTADOS_VIGENTES, desde = cita.inicio - DURACION_MAXIMA_MIN,
  // hasta = cita.fin). El filtro por tenantId + usuarioId es requisito de
  // seguridad.
  abstract buscarPorProfesionalEnRango(
    tenantId: string,
    usuarioId: string,
    desde: Date,
    hasta: Date,
    opciones?: { estados?: readonly EstadoCita[] },
    tx?: TransactionContext,
  ): Promise<Cita[]>;
}
