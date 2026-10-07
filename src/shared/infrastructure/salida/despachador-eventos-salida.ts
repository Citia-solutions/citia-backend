import { Logger } from '@nestjs/common';

import {
  EstadoEventoSalida,
  EventoSalida,
  EventosSalidaRepository,
} from '../../application/eventos-salida.repository';
import { PoliticaReintentoSalida } from '../../application/politica-reintento-salida';
import {
  EventoEntregado,
  SuscriptorEventos,
} from '../../application/suscriptor-eventos';
import { TransactionRunner } from '../../application/transaction-runner';
import { RegistroSuscriptores } from './registro-suscriptores';

export interface OpcionesDespacho {
  /** `EVENTOS_SALIDA_LOTE`: hechos como máximo por tick. */
  lote: number;
  /** Espera entre reintentos y paso a `fallido` (`EVENTOS_SALIDA_MAX_INTENTOS`). */
  politica: PoliticaReintentoSalida;
  /**
   * Se consulta antes de reclamar cada hecho. `false` = no tomar más trabajo
   * (apagado ordenado, ADR-12 §5): el hecho en curso termina y el lote se corta.
   */
  continuar?: () => boolean;
}

export interface ResultadoDespacho {
  /** Hechos reclamados en este tick. */
  procesados: number;
  entregados: number;
  /** Fallaron y siguen `pendiente`, con un próximo intento más tarde. */
  reintentos: number;
  /** Fallaron por última vez y pasaron a `fallido` (carta muerta). */
  cartasMuertas: number;
  /** Fallaron, pero otro proceso ya los había resuelto. */
  resueltosPorOtro: number;
}

/** Prefijo del código de error cuando lo que falla no es un suscriptor. */
const ORIGEN_DESPACHADOR = 'DespachadorEventosSalida';

/** Error de un suscriptor, con su nombre, para armar el código corto. */
class FalloSuscriptor extends Error {
  constructor(
    readonly suscriptor: string,
    readonly original: unknown,
  ) {
    super(`fallo en ${suscriptor}`);
    this.name = 'FalloSuscriptor';
  }
}

/**
 * Entrega los hechos del outbox a sus suscriptores (ADR-12 §3, §4).
 *
 * Por cada hecho, UNA transacción:
 *   reclamar (FOR UPDATE SKIP LOCKED) → suscriptores con ese mismo `tx` →
 *   marcar entregado → commit.
 *
 * Si algo lanza dentro, la transacción se revierte entera y, en OTRA
 * transacción, se registra el fallo con un código corto
 * (`<Suscriptor>:<error.name>`, nunca el mensaje: podría traer datos
 * personales). Al agotar los intentos el hecho queda `fallido` y se emite el
 * log de alerta `eventos_salida.fallido` (ADR-13 §16).
 *
 * Sin suscriptores para un hecho, se marca entregado igual.
 *
 * `despachar` lanza SOLO si falla la infraestructura (no se pudo reclamar ni
 * registrar un fallo): el planificador lo cuenta como tick fallido. Los fallos
 * de los suscriptores se registran y el lote sigue.
 *
 * Los métodos del repositorio que usa son BARRIDO GLOBAL (ADR-12 §6): solo lo
 * invoca el planificador, nunca una ruta HTTP. Lo que hagan los suscriptores
 * debe usar el `tenantId` del hecho.
 */
export class DespachadorEventosSalida {
  private readonly logger = new Logger(DespachadorEventosSalida.name);

  constructor(
    private readonly transacciones: TransactionRunner,
    private readonly salida: EventosSalidaRepository,
    private readonly registro: RegistroSuscriptores,
    private readonly reloj: () => Date = () => new Date(),
  ) {}

  async despachar(opciones: OpcionesDespacho): Promise<ResultadoDespacho> {
    const { lote, politica, continuar = () => true } = opciones;
    const resultado: ResultadoDespacho = {
      procesados: 0,
      entregados: 0,
      reintentos: 0,
      cartasMuertas: 0,
      resueltosPorOtro: 0,
    };

    while (resultado.procesados < lote && continuar()) {
      // Fuera del callback: si la transacción se revierte, hay que saber qué
      // hecho se había reclamado para registrar su fallo.
      const reclamado: { evento?: EventoSalida } = {};
      try {
        const hubo = await this.transacciones.run(async (tx) => {
          const evento = await this.salida.reclamarProximoPendiente(
            this.reloj(),
            tx,
          );
          if (!evento) {
            return false;
          }
          reclamado.evento = evento;
          await this.entregar(evento, tx);
          const marcado = await this.salida.marcarEntregado(
            evento.id,
            this.reloj(),
            tx,
          );
          if (!marcado) {
            // No debería pasar: la fila está bloqueada por este `tx`.
            this.logger.warn({
              evento: 'eventos_salida.ya_no_pendiente',
              eventoId: evento.id,
              nombre: evento.nombre,
            });
          }
          return true;
        });
        if (!hubo) {
          break; // no queda trabajo listo
        }
        resultado.procesados++;
        resultado.entregados++;
        this.logger.debug({
          evento: 'eventos_salida.entregado',
          eventoId: reclamado.evento?.id,
          nombre: reclamado.evento?.nombre,
        });
      } catch (error: unknown) {
        const evento = reclamado.evento;
        if (!evento) {
          // Falló el reclamo: es la base, no un hecho. Corta el tick.
          throw error;
        }
        resultado.procesados++;
        await this.registrarFallo(
          evento,
          codigoDeFallo(error),
          politica,
          resultado,
        );
      }
    }
    return resultado;
  }

  private async entregar(evento: EventoSalida, tx: unknown): Promise<void> {
    const entregado: EventoEntregado = {
      id: evento.id,
      nombre: evento.nombre,
      tenantId: evento.tenantId,
      ocurridoEn: evento.ocurridoEn,
      payload: evento.payload,
    };
    for (const suscriptor of this.registro.suscriptoresDe(evento.nombre)) {
      try {
        await suscriptor.manejar(entregado, tx);
      } catch (error: unknown) {
        throw new FalloSuscriptor(nombreDe(suscriptor), error);
      }
    }
  }

  /** En una transacción aparte. Si esto también falla, lanza (infraestructura). */
  private async registrarFallo(
    evento: EventoSalida,
    codigo: string,
    politica: PoliticaReintentoSalida,
    resultado: ResultadoDespacho,
  ): Promise<void> {
    const actualizado = await this.transacciones.run((tx) =>
      this.salida.registrarFallo(evento.id, codigo, this.reloj(), politica, tx),
    );

    if (!actualizado) {
      // Otro proceso lo tomó entre la reversión y este registro y lo resolvió.
      resultado.resueltosPorOtro++;
      return;
    }

    if (actualizado.estado === EstadoEventoSalida.FALLIDO) {
      resultado.cartasMuertas++;
      this.logger.error({
        alerta: 'eventos_salida.fallido',
        eventoId: actualizado.id,
        nombre: actualizado.nombre,
        intentos: actualizado.intentos,
        codigo,
        msg: `Hecho ${actualizado.nombre} en carta muerta tras ${actualizado.intentos} intentos`,
      });
      return;
    }

    resultado.reintentos++;
    this.logger.warn({
      evento: 'eventos_salida.reintento',
      eventoId: actualizado.id,
      nombre: actualizado.nombre,
      intentos: actualizado.intentos,
      proximoIntentoEn: actualizado.proximoIntentoEn.toISOString(),
      codigo,
      msg: `Hecho ${actualizado.nombre} falló; se reintentará`,
    });
  }
}

function nombreDe(suscriptor: SuscriptorEventos): string {
  return suscriptor.constructor.name || 'SuscriptorAnonimo';
}

/**
 * `<origen>:<error.name>[:<code>]`. Solo identificadores: el `name` del error
 * y, si lo trae, un código corto (p. ej. el SQLSTATE `23505` de Postgres).
 * Nunca `message`, que puede llevar valores de la consulta o del payload.
 */
export function codigoDeFallo(error: unknown): string {
  const [origen, causa] =
    error instanceof FalloSuscriptor
      ? [error.suscriptor, error.original]
      : [ORIGEN_DESPACHADOR, error];
  return [origen, ...identificadoresDe(causa)].join(':');
}

function identificadoresDe(error: unknown): string[] {
  if (typeof error !== 'object' || error === null) {
    return ['Desconocido'];
  }
  const { name, code } = error as { name?: unknown; code?: unknown };
  const partes = [
    typeof name === 'string' && /^\w{1,64}$/.test(name) ? name : 'Error',
  ];
  if (typeof code === 'string' && /^[A-Za-z0-9_]{1,32}$/.test(code)) {
    partes.push(code);
  }
  return partes;
}
