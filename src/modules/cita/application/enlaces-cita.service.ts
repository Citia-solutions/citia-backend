import { AuthenticatedUser } from '../../auth/jwt-payload.interface';
import {
  TransactionContext,
  TransactionRunner,
} from '../../../shared/application/transaction-runner';
import { Cita } from '../domain/cita.entity';
import { CitaRepository } from '../domain/cita.repository';
import {
  DerivadorTokenEnlace,
  esFormatoTokenEnlace,
} from '../domain/derivador-token-enlace';
import { EnlaceCita } from '../domain/enlace-cita.entity';
import { EnlaceCitaRepository } from '../domain/enlace-cita.repository';
import { CitaNoEncontradaError } from './cita-no-encontrada.error';

/** Un enlace válido y su cita, ya BLOQUEADA (`FOR NO KEY UPDATE`) en el tx de quien llama. */
export interface EnlaceResuelto {
  enlace: EnlaceCita;
  cita: Cita;
}

/**
 * Aviso de la autocorrección por cambio de clave (DT-45). Solo ids y
 * versiones: nunca el token ni su hash.
 */
export interface AvisoEnlaceReemitido {
  evento: 'enlace_cita.reemitido_por_cambio_de_clave';
  citaId: string;
  tenantId: string;
  versionRevocada: number;
}

export type AvisarEnlaceReemitido = (aviso: AvisoEnlaceReemitido) => void;

/**
 * Enlace del paciente a su cita (Fase 3; ADR-10 §1, contrato §3.1).
 *
 * Exportado por `CitaModule`: lo usan `recordatorio` (`asegurarActivo`, en la
 * transacción del envío) y `portal-paciente` (`resolver`, en la transacción
 * de la acción). La ruta de invalidar vive en `CitasController`.
 *
 * **Orden de bloqueo: siempre la CITA primero** (`buscarPorIdParaActualizar`)
 * y después su enlace. Así una acción del paciente, una invalidación y una
 * mutación del profesional sobre la misma cita se serializan sin
 * interbloqueos.
 *
 * El token nunca se guarda ni se registra: se recalcula con
 * `DerivadorTokenEnlace` a partir de (cita, versión).
 */
export class EnlacesCitaService {
  constructor(
    private readonly enlaces: EnlaceCitaRepository,
    private readonly citas: CitaRepository,
    private readonly derivador: DerivadorTokenEnlace,
    private readonly transacciones: TransactionRunner,
    private readonly reloj: () => Date = () => new Date(),
    private readonly avisar: AvisarEnlaceReemitido = () => undefined,
  ) {}

  /**
   * Token del enlace ACTIVO de la cita, emitiéndolo si no hay ninguno (E3).
   * Corre DENTRO del `tx` de quien llama (el envío del recordatorio).
   *
   * - Hay uno activo → su token (el mismo en todos los recordatorios, E1).
   * - No hay → `max(version) + 1` (1 si nunca tuvo), `INSERT … ON CONFLICT
   *   DO NOTHING` y relectura: dos envíos a la vez de la misma cita terminan
   *   con UN enlace y el mismo token.
   * - **Autocorrección (DT-45):** si el activo no corresponde a la clave
   *   vigente (`hashear(derivar(cita, version)) ≠ token_hash`, porque
   *   `ENLACE_CITA_CLAVE` cambió), se revoca como revocación del sistema
   *   (`revocado_por` nulo) y se emite la versión siguiente con la clave
   *   vigente. El correo anterior deja de servir, como tras invalidar.
   *
   * Lanza si algo falla (el envío lo trata como error interno y reintenta):
   * nunca devuelve un token que no resuelva.
   */
  async asegurarActivo(
    citaId: string,
    tenantId: string,
    tx: TransactionContext,
  ): Promise<string> {
    let activo = await this.enlaces.buscarActivoPorCita(citaId, tx);

    if (activo && !this.correspondeAClaveVigente(activo)) {
      activo = await this.reemitirPorCambioDeClave(citaId, tenantId, tx);
    }

    if (!activo) {
      activo = await this.emitirSiguiente(citaId, tenantId, tx);
    }

    if (!this.correspondeAClaveVigente(activo)) {
      // Solo pasa si otro proceso, con OTRA clave, emitió el activo entre
      // medio (dos claves vivas a la vez). Mejor reintentar que mandar un
      // enlace que no resuelve.
      throw new Error(
        'EnlacesCitaService.asegurarActivo: el enlace activo no corresponde a la clave vigente',
      );
    }

    return this.derivador.derivar(citaId, activo.version);
  }

  /**
   * Resuelve un token del portal DENTRO del `tx` de la acción:
   *
   *  1. formato inválido (≠ 43 caracteres base64url) → `null` sin tocar la base;
   *  2. enlace por `sha256(token)` (activo o revocado);
   *  3. bloquea la CITA (`FOR NO KEY UPDATE`) con el id y el tenant DEL ENLACE —nunca
   *     ids del cliente—;
   *  4. RELEE el enlace por su hash: con la cita bloqueada, una invalidación
   *     concurrente ya confirmó o espera detrás de este tx;
   *  5. `permiteActuarSobre(cita, ahora)`: no revocado, misma cita y tenant,
   *     cita vigente y `ahora < inicio` vigente.
   *
   * Cualquier fallo → `null`: el portal responde el MISMO 404 para todos.
   */
  async resolver(
    token: unknown,
    tx: TransactionContext,
  ): Promise<EnlaceResuelto | null> {
    if (!esFormatoTokenEnlace(token)) return null;

    const hash = this.derivador.hashear(token);
    const candidato = await this.enlaces.buscarPorTokenHash(hash, tx);
    if (!candidato) return null;

    const cita = await this.citas.buscarPorIdParaActualizar(
      candidato.citaId,
      candidato.tenantId,
      tx,
    );
    if (!cita) return null;

    const enlace = await this.enlaces.buscarPorTokenHash(hash, tx);
    if (!enlace || !enlace.permiteActuarSobre(cita, this.reloj())) {
      return null;
    }

    return { enlace, cita };
  }

  /**
   * El profesional invalida el enlace desde el voucher (S1):
   * `POST /api/citas/:id/enlace/invalidar` → 204.
   *
   * Abre SU transacción; bloquea la cita por id + tenant del token (otro
   * tenant o inexistente → `CitaNoEncontradaError`, 404). Sin enlace activo
   * no hace nada (idempotente). El siguiente recordatorio emite la versión
   * siguiente.
   */
  async invalidar(citaId: string, usuario: AuthenticatedUser): Promise<void> {
    await this.transacciones.run(async (tx) => {
      const cita = await this.citas.buscarPorIdParaActualizar(
        citaId,
        usuario.tenantId,
        tx,
      );
      if (!cita) {
        throw new CitaNoEncontradaError(citaId);
      }

      const activo = await this.enlaces.buscarActivoPorCita(cita.id, tx);
      if (!activo) return;

      activo.invalidar(usuario.userId, this.reloj());
      await this.enlaces.guardar(activo, tx);
    });
  }

  // ---------------------------------------------------------------------
  // Internos
  // ---------------------------------------------------------------------

  private correspondeAClaveVigente(enlace: EnlaceCita): boolean {
    const token = this.derivador.derivar(enlace.citaId, enlace.version);
    return this.derivador.hashear(token) === enlace.tokenHash;
  }

  /**
   * Inserta `max(version) + 1` para la cita y relee el activo. Si otro
   * proceso ganó la carrera (`ON CONFLICT DO NOTHING` → `false`), la
   * relectura devuelve el suyo.
   */
  private async emitirSiguiente(
    citaId: string,
    tenantId: string,
    tx: TransactionContext,
  ): Promise<EnlaceCita> {
    const version = EnlaceCita.siguienteVersion(
      await this.enlaces.maxVersion(citaId, tx),
    );
    await this.enlaces.insertarSiNoExiste(
      EnlaceCita.emitir({
        citaId,
        tenantId,
        version,
        tokenHash: this.derivador.hashear(
          this.derivador.derivar(citaId, version),
        ),
      }),
      tx,
    );

    const activo = await this.enlaces.buscarActivoPorCita(citaId, tx);
    if (!activo) {
      // Insertó (o chocó con otro) y aun así no hay activo: se revocó entre
      // medio. Se reintenta en el próximo envío.
      throw new Error(
        'EnlacesCitaService.asegurarActivo: no quedó un enlace activo tras emitirlo',
      );
    }
    return activo;
  }

  /**
   * DT-45: el activo es de otra clave. Respeta el orden de bloqueo (cita
   * primero), RELEE el activo con la cita bloqueada y, si sigue sin
   * corresponder, lo revoca como sistema. Devuelve el activo que quede (o
   * `null` para que se emita la versión siguiente).
   */
  private async reemitirPorCambioDeClave(
    citaId: string,
    tenantId: string,
    tx: TransactionContext,
  ): Promise<EnlaceCita | null> {
    const cita = await this.citas.buscarPorIdParaActualizar(
      citaId,
      tenantId,
      tx,
    );
    if (!cita) {
      throw new Error(
        'EnlacesCitaService.asegurarActivo: la cita del enlace no existe en su tenant',
      );
    }

    const activo = await this.enlaces.buscarActivoPorCita(citaId, tx);
    if (!activo || this.correspondeAClaveVigente(activo)) return activo;

    activo.invalidar(null, this.reloj());
    await this.enlaces.guardar(activo, tx);
    this.avisar({
      evento: 'enlace_cita.reemitido_por_cambio_de_clave',
      citaId,
      tenantId,
      versionRevocada: activo.version,
    });
    return null;
  }
}
