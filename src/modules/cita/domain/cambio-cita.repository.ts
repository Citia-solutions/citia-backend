import { TransactionContext } from '../../../shared/application/transaction-runner';
import { ActorCambio, CambioCita, TipoCambio } from './cambio-cita.entity';

/** El último cambio de un tipo en la bitácora: quién lo provocó y cuándo. */
export interface UltimoCambio {
  actor: ActorCambio;
  ocurridoEn: Date;
}

export abstract class CambioCitaRepository {
  // Append-only: solo se agrega. No hay actualizar ni borrar a proposito.
  abstract registrar(
    cambio: CambioCita,
    tx?: TransactionContext,
  ): Promise<CambioCita>;

  // Historial completo de una cita, del mas antiguo al mas reciente.
  abstract historialDeCita(
    citaId: string,
    tenantId: string,
    tx?: TransactionContext,
  ): Promise<CambioCita[]>;

  /**
   * El ÚLTIMO cambio de cada uno de `tipos` en la bitácora de la cita: quién
   * lo provocó y cuándo. Lo usa `GET /citas/:id` para `confirmadaPor` /
   * `canceladaPor` (Fase 3, G3), y el `ocurridoEn` permite comparar la última
   * confirmación con el último reagendamiento (US-07.01, H9). "Último" =
   * `ocurrido_en` más reciente; a igual instante desempata el `id`.
   *
   * Los tipos sin ningún cambio no aparecen en el resultado (quien llama los
   * traduce a `null`). Con `tipos` vacío devuelve `{}` sin consultar. El filtro
   * por `tenantId` es requisito de seguridad.
   */
  abstract ultimosCambiosPorTipo(
    citaId: string,
    tenantId: string,
    tipos: readonly TipoCambio[],
    tx?: TransactionContext,
  ): Promise<Partial<Record<TipoCambio, UltimoCambio>>>;
}
