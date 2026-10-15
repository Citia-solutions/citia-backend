import { TransactionContext } from '../../../shared/application/transaction-runner';
import { ActorCambio, CambioCita, TipoCambio } from './cambio-cita.entity';

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
   * Quién provocó el ÚLTIMO cambio de cada uno de `tipos` en la bitácora de
   * la cita (Fase 3, G3: `confirmadaPor` / `canceladaPor` de
   * `GET /citas/:id`). "Último" = `ocurrido_en` más reciente.
   *
   * Los tipos sin ningún cambio no aparecen en el resultado (quien llama los
   * traduce a `null`). Con `tipos` vacío devuelve `{}` sin consultar. El filtro
   * por `tenantId` es requisito de seguridad.
   */
  abstract ultimoActorPorTipo(
    citaId: string,
    tenantId: string,
    tipos: readonly TipoCambio[],
    tx?: TransactionContext,
  ): Promise<Partial<Record<TipoCambio, ActorCambio>>>;
}
