import { TransactionContext } from '../../../shared/application/transaction-runner';
import { AceptacionTerminos } from './aceptacion-terminos.entity';

/**
 * Puerto de `aceptaciones_terminos` (US-11, ADR-16 §3). **Solo inserción**: no
 * hay `UPDATE` ni `DELETE`, a propósito. La tabla es la prueba.
 */
export abstract class AceptacionTerminosRepository {
  /**
   * Inserta la aceptación si no hay ya una del mismo paciente, versión y
   * canal (D11: `ON CONFLICT DO NOTHING` sobre el índice único; gana el
   * PRIMER acto, también en una carrera). Solo escribe si el paciente es de
   * `aceptacion.tenantId`: un paciente de otra organización (o inexistente)
   * no escribe nada. Un id que no es UUID tampoco (sin consultar).
   *
   * `true` si insertó. `tx` obligatorio: corre en la transacción de quien
   * registra (sin ella, lanza). No pone la bandera `pacientes.consentimiento`:
   * eso es `PacienteRepository.marcarConsentimiento`.
   */
  abstract insertarSiNoExiste(
    aceptacion: AceptacionTerminos,
    tx: TransactionContext,
  ): Promise<boolean>;

  /**
   * ¿El TITULAR (`CANALES_DEL_TITULAR`: formulario o enlace) aceptó alguna de
   * `versiones`? La del canal `profesional` no cuenta. Filtra por tenant.
   * Lectura sin bloqueo; con `versiones` vacío o un id que no es UUID,
   * `false` sin consultar.
   */
  abstract existeDelTitular(
    pacienteId: string,
    tenantId: string,
    versiones: readonly string[],
    tx?: TransactionContext,
  ): Promise<boolean>;
}
