import {
  TransactionContext,
  TransactionRunner,
} from '../../../shared/application/transaction-runner';
import {
  AlcanceCuota,
  CanalMensajeria,
  MensajeSaliente,
  ResultadoEnvio,
  TipoResultadoEnvio,
  claveIdempotencia,
} from '../domain/canal-mensajeria';
import { ConfiguracionRecordatorio } from '../domain/configuracion-recordatorio.entity';
import { ConfiguracionRecordatorioRepository } from '../domain/configuracion-recordatorio.repository';
import { calcularHashCorreo } from '../domain/hash-correo';
import { HorasSinEnvio } from '../domain/horas-sin-envio';
import { DatosEnvioCita, LectorCitas } from '../domain/lector-citas';
import {
  Periodo,
  periodoDiaEnZona,
  periodoDiaUtc,
  periodoMesUtc,
} from '../domain/periodos-conteo';
import {
  ContextoEnvio,
  NombrePoliticaEnvio,
  PoliticaEnvio,
  crearPoliticasEnvio,
  evaluarPoliticasEnvio,
} from '../domain/politicas-envio';
import { MotivoFallo, MotivoRecordatorio } from '../domain/recordatorio.entity';
import {
  DatosRecordatorio,
  RecordatorioRepository,
} from '../domain/recordatorio.repository';
import { calcularReintento } from '../domain/reintentos-envio';
import { SupresionCorreoRepository } from '../domain/supresion-correo.repository';
import { AvisosPorPeriodo, alcanzaUmbral } from './avisos-por-periodo';
import {
  AlertaRecordatorios,
  BitacoraRecordatorios,
  ValorCampoBitacora,
} from './bitacora-recordatorios';
import { generarPlantillaRecordatorio } from './plantilla-recordatorio';
import { codigoDeError } from './reconciliacion-respaldo.service';

/** ADR-13 §7.5: espera mínima entre dos llamadas al proveedor. */
export const PAUSA_ENTRE_ENVIOS_MS = 500;
/**
 * Tope de una llamada al canal (ADR-13 §7.4: 10 s). El adaptador aplica el
 * suyo; este es la defensa del caso de uso, con un margen, porque la fila
 * queda bloqueada mientras dura la llamada.
 */
export const TIEMPO_MAXIMO_ENVIO_MS = 11_000;

/** Parámetros del entorno (ADR-13 §18). */
export interface OpcionesEnvio {
  /** `APP_TZ`: día del fusible por tenant, horas sin envío y texto. */
  tz: string;
  silencio: HorasSinEnvio;
  /** `RECORDATORIO_EXIGIR_CONSENTIMIENTO` (false, DT-16). */
  exigirConsentimiento: boolean;
  /** `RECORDATORIO_MAX_DIARIO_POR_TENANT` (40). */
  maxDiarioPorTenant: number;
  /** `RESEND_CUOTA_DIARIA` (100) y `RESEND_CUOTA_MENSUAL` (3000). */
  cuotaDiaria: number;
  cuotaMensual: number;
  /** `CUOTA_UMBRAL_AVISO` (0,8). */
  umbralAvisoCuota: number;
  /** `RECORDATORIO_MAX_INTENTOS` (5): reintentos tras errores transitorios. */
  maxReintentos: number;
  /** `RECORDATORIO_ANTELACIONES_MIN`: la configuración de quien no guardó ninguna. */
  antelacionesPredeterminadasMin: readonly number[];
  pausaEntreEnviosMs?: number;
  tiempoMaximoEnvioMs?: number;
}

export interface DependenciasEnvio {
  transacciones: TransactionRunner;
  recordatorios: RecordatorioRepository;
  configuraciones: ConfiguracionRecordatorioRepository;
  supresiones: SupresionCorreoRepository;
  lector: LectorCitas;
  canal: CanalMensajeria;
  bitacora: BitacoraRecordatorios;
}

/** Cómo terminó un recordatorio reclamado. */
export type DesenlaceEnvio =
  | 'enviado'
  | 'reintento'
  | 'pospuesto'
  | 'omitido'
  | 'cancelado'
  | 'fallido'
  /** `configuracion` del proveedor o guarda que no aplicó: la fila no cambió. */
  | 'sin_cambios'
  /** Lanzó dentro de su transacción; se registró un reintento aparte. */
  | 'error_interno';

/** Por qué se cortó el lote antes de tiempo (ADR-13 §8). */
export type CorteLote = 'cuota_agotada' | 'configuracion';

export interface ResultadoEnvioRecordatorio {
  recordatorioId: string;
  desenlace: DesenlaceEnvio;
  /** `true` si se llamó a `CanalMensajeria.enviar`. */
  llamoProveedor: boolean;
  corte: CorteLote | null;
}

export interface ResultadoLoteEnvio {
  /** Recordatorios reclamados. */
  procesados: number;
  enviados: number;
  reintentos: number;
  pospuestos: number;
  omitidos: number;
  cancelados: number;
  fallidos: number;
  sinCambios: number;
  erroresInternos: number;
  /** Se cortó por cuota agotada o configuración del proveedor. */
  corte: CorteLote | null;
  /** Se cortó por el apagado. */
  interrumpido: boolean;
}

export interface OpcionesLote {
  /** `RECORDATORIO_LOTE` (20): recordatorios como máximo por tick. */
  lote: number;
  /** Se consulta antes de reclamar cada uno (apagado ordenado). */
  continuar?: () => boolean;
}

/** Lo leído para un recordatorio, además del contexto de las políticas. */
interface Lectura {
  politicas: ContextoEnvio;
  datos: DatosEnvioCita | null;
  configuracion: ConfiguracionRecordatorio | null;
  cuota: {
    dia: Periodo;
    mes: Periodo;
    enviadosDia: number;
    enviadosMes: number;
  };
}

class TiempoAgotadoEnvioError extends Error {
  constructor() {
    super('tiempo_agotado');
    this.name = 'TiempoAgotadoEnvioError';
  }
}

/**
 * Envío de recordatorios (ADR-13 §7–§9, §11), invocado por el planificador
 * cada `RECORDATORIO_INTERVALO_SEG`.
 *
 * Por cada recordatorio, UNA transacción:
 *  1. **Reclamar** el `programado` vencido más antiguo (BARRIDO GLOBAL,
 *     `FOR UPDATE SKIP LOCKED`); desde ahí, todo usa el `tenantId` de la fila.
 *  2. **Releer** cita, paciente, profesional y organización
 *     (`LectorCitas.obtenerDatosEnvio`), la configuración del DUEÑO de la cita
 *     (o la predeterminada), la supresión del correo (por hash, solo si hay
 *     correo), los envíos del tenant hoy (día de la clínica) y la cuota local
 *     (día y mes UTC).
 *  3. **Evaluar las nueve políticas** en orden y aplicar la primera que no
 *     continúa: anular, omitir, posponer o fallar (sin sumar intento).
 *  4. **Enviar:** plantilla generada ahora + `CanalMensajeria.enviar`, y
 *     aplicar el resultado (tabla de ADR-13 §8).
 *
 * **La transacción queda abierta durante la llamada HTTP**, con la fila
 * bloqueada (ADR-13 §7, deliberado): si el proceso muere después de que el
 * proveedor aceptó y antes del commit, la fila vuelve a `programado` y el
 * reintento lo absorbe la `Idempotency-Key`. El adaptador corta a los 10 s y
 * este caso de uso a los `TIEMPO_MAXIMO_ENVIO_MS`, así la fila nunca queda
 * tomada más que eso.
 *
 * El 429 de cuota del proveedor MANDA sobre el contador local (ADR-13 §11):
 * desde ese momento y hasta el reinicio del periodo, este proceso trata la
 * cuota como agotada sin volver a llamar.
 *
 * Logs (ADR-13 §16): `recordatorio.enviado` / `.omitido` / `.cancelado` /
 * `.pospuesto` / `.reintento` / `.fallido`, y las alertas de cuota y
 * configuración. Solo ids, estados y códigos.
 */
export class EnviarRecordatoriosService {
  private readonly politicas: readonly PoliticaEnvio[];
  private readonly avisos = new AvisosPorPeriodo();
  private readonly pausaMs: number;
  private readonly tiempoMaximoMs: number;
  /** Hasta cuándo el proveedor dijo que la cuota está agotada (por alcance). */
  private readonly bloqueoCuota: { dia: Date | null; mes: Date | null } = {
    dia: null,
    mes: null,
  };

  constructor(
    private readonly d: DependenciasEnvio,
    private readonly opciones: OpcionesEnvio,
    private readonly reloj: () => Date = () => new Date(),
    private readonly esperar: (ms: number) => Promise<void> = esperarMs,
  ) {
    this.politicas = crearPoliticasEnvio({
      tz: opciones.tz,
      silencio: opciones.silencio,
      exigirConsentimiento: opciones.exigirConsentimiento,
      maxDiarioPorTenant: opciones.maxDiarioPorTenant,
      cuotaDiaria: opciones.cuotaDiaria,
      cuotaMensual: opciones.cuotaMensual,
    });
    this.pausaMs = opciones.pausaEntreEnviosMs ?? PAUSA_ENTRE_ENVIOS_MS;
    this.tiempoMaximoMs =
      opciones.tiempoMaximoEnvioMs ?? TIEMPO_MAXIMO_ENVIO_MS;
  }

  /**
   * Un tick: hasta `lote` recordatorios, uno por transacción. Lanza SOLO si
   * falla la infraestructura (no se pudo reclamar ni registrar un error
   * interno); el planificador lo cuenta como tick fallido.
   */
  async enviarLote(opciones: OpcionesLote): Promise<ResultadoLoteEnvio> {
    const continuar = opciones.continuar ?? (() => true);
    const resultado: ResultadoLoteEnvio = {
      procesados: 0,
      enviados: 0,
      reintentos: 0,
      pospuestos: 0,
      omitidos: 0,
      cancelados: 0,
      fallidos: 0,
      sinCambios: 0,
      erroresInternos: 0,
      corte: null,
      interrumpido: false,
    };

    let pausaPendiente = false;
    for (let i = 0; i < opciones.lote; i++) {
      if (!continuar()) {
        resultado.interrumpido = true;
        break;
      }
      if (pausaPendiente) {
        // Ritmo del proveedor (ADR-13 §7.5), fuera de la transacción.
        await this.esperar(this.pausaMs);
        pausaPendiente = false;
      }

      const uno = await this.procesarSiguiente();
      if (uno === null) break;

      resultado.procesados++;
      contar(resultado, uno.desenlace);
      pausaPendiente = uno.llamoProveedor;
      if (uno.corte) {
        resultado.corte = uno.corte;
        break;
      }
    }
    return resultado;
  }

  /**
   * Reclama y procesa UN recordatorio en su transacción. `null` si no queda
   * ninguno vencido y libre. Público para invocarlo a mano (e2e).
   */
  async procesarSiguiente(): Promise<ResultadoEnvioRecordatorio | null> {
    let reclamado: DatosRecordatorio | null = null;
    try {
      return await this.d.transacciones.run(async (tx) => {
        const ahora = this.reloj();
        const fila = await this.d.recordatorios.reclamarProximoProgramado(
          ahora,
          tx,
        );
        if (!fila) return null;
        reclamado = fila;
        return this.procesar(fila, ahora, tx);
      });
    } catch (error: unknown) {
      if (reclamado === null) throw error; // ni siquiera se pudo reclamar
      return this.registrarErrorInterno(reclamado, error);
    }
  }

  // ---------------------------------------------------------------------------
  // Un recordatorio
  // ---------------------------------------------------------------------------

  private async procesar(
    fila: DatosRecordatorio,
    ahora: Date,
    tx: TransactionContext,
  ): Promise<ResultadoEnvioRecordatorio> {
    const lectura = await this.leer(fila, ahora, tx);
    const decision = evaluarPoliticasEnvio(this.politicas, lectura.politicas);
    const politica = decision.politica;
    const r = this.d.recordatorios;

    let salida: ResultadoEnvioRecordatorio;
    switch (decision.tipo) {
      case 'cancelar': {
        const ok = await r.anular(
          [fila.id],
          fila.tenantId,
          decision.motivo,
          tx,
        );
        salida = this.desenlace(
          fila,
          ok.length > 0 ? 'cancelado' : 'sin_cambios',
        );
        this.log('info', 'recordatorio.cancelado', fila, {
          motivo: decision.motivo,
          politica,
        });
        break;
      }
      case 'omitir': {
        const ok = await r.omitir(fila.id, fila.tenantId, decision.motivo, tx);
        salida = this.desenlace(fila, ok ? 'omitido' : 'sin_cambios');
        this.log('info', 'recordatorio.omitido', fila, {
          motivo: decision.motivo,
          politica,
        });
        break;
      }
      case 'posponer': {
        const ok = await r.posponer(fila.id, fila.tenantId, decision.hasta, tx);
        salida = this.desenlace(fila, ok ? 'pospuesto' : 'sin_cambios');
        this.log('info', 'recordatorio.pospuesto', fila, {
          politica,
          hasta: decision.hasta.toISOString(),
        });
        if (politica === 'cuota_proveedor') {
          this.alertarCuotaAgotada(this.alcanceLocal(lectura), ahora, 'local');
        }
        break;
      }
      case 'fallar': {
        const ok = await r.registrarFallo(
          fila.id,
          fila.tenantId,
          { motivo: decision.motivo, ultimoError: null, contarIntento: false },
          tx,
        );
        salida = this.desenlace(fila, ok ? 'fallido' : 'sin_cambios');
        this.logFallo(fila, decision.motivo, politica, null);
        if (decision.motivo === MotivoRecordatorio.CUOTA_AGOTADA) {
          this.alertarCuotaAgotada(this.alcanceLocal(lectura), ahora, 'local');
        }
        break;
      }
      case 'enviar':
        salida = await this.enviar(fila, lectura, tx);
        break;
    }

    this.avisarCuota80(lectura, salida.desenlace === 'enviado');
    return salida;
  }

  /** Paso 2 de ADR-13 §7: todo con el `tenantId` de la fila. */
  private async leer(
    fila: DatosRecordatorio,
    ahora: Date,
    tx: TransactionContext,
  ): Promise<Lectura> {
    const dia = periodoDiaUtc(ahora);
    const mes = periodoMesUtc(ahora);
    const datos = await this.d.lector.obtenerDatosEnvio(
      fila.citaId,
      fila.tenantId,
      tx,
    );

    if (!datos) {
      // La cita ya no existe en el tenant: la política 1 la anula. No hace
      // falta leer nada más.
      return {
        datos: null,
        configuracion: null,
        cuota: { dia, mes, enviadosDia: 0, enviadosMes: 0 },
        politicas: {
          ahora,
          recordatorio: { inicioCita: fila.inicioCita, venceEn: fila.venceEn },
          cita: null,
          configuracion: { activo: true },
          correoPaciente: null,
          consentimientoPaciente: false,
          correoSuprimido: false,
          enviadosHoyTenant: 0,
          cuota: {
            enviadosDia: 0,
            enviadosMes: 0,
            reinicioDia: dia.hasta,
            reinicioMes: mes.hasta,
          },
        },
      };
    }

    const configuracion = await this.configuracionDe(
      fila.tenantId,
      datos.cita.usuarioId,
      tx,
    );
    const correo = datos.paciente.correo?.trim() ? datos.paciente.correo : null;
    const correoSuprimido = correo
      ? await this.d.supresiones.existe(calcularHashCorreo(correo), tx)
      : false;
    const diaClinica = periodoDiaEnZona(ahora, this.opciones.tz);
    const enviadosHoyTenant =
      await this.d.recordatorios.contarEnviadosDeTenantEntre(
        fila.tenantId,
        diaClinica.desde,
        diaClinica.hasta,
        tx,
      );
    const enviadosDia = await this.d.recordatorios.contarEnviadosEntre(
      dia.desde,
      dia.hasta,
      tx,
    );
    const enviadosMes = await this.d.recordatorios.contarEnviadosEntre(
      mes.desde,
      mes.hasta,
      tx,
    );

    return {
      datos,
      configuracion,
      cuota: { dia, mes, enviadosDia, enviadosMes },
      politicas: {
        ahora,
        recordatorio: { inicioCita: fila.inicioCita, venceEn: fila.venceEn },
        cita: { inicio: datos.cita.inicio, vigente: datos.cita.vigente },
        configuracion: { activo: configuracion.activo },
        correoPaciente: correo,
        consentimientoPaciente: datos.paciente.consentimiento,
        correoSuprimido,
        enviadosHoyTenant,
        cuota: {
          // El 429 de cuota del proveedor manda sobre el contador local.
          enviadosDia: this.cuotaBloqueada('dia', ahora)
            ? Math.max(enviadosDia, this.opciones.cuotaDiaria)
            : enviadosDia,
          enviadosMes: this.cuotaBloqueada('mes', ahora)
            ? Math.max(enviadosMes, this.opciones.cuotaMensual)
            : enviadosMes,
          reinicioDia: dia.hasta,
          reinicioMes: mes.hasta,
        },
      },
    };
  }

  private async configuracionDe(
    tenantId: string,
    usuarioId: string,
    tx: TransactionContext,
  ): Promise<ConfiguracionRecordatorio> {
    const guardada = await this.d.configuraciones.obtener(
      tenantId,
      usuarioId,
      tx,
    );
    return guardada
      ? ConfiguracionRecordatorio.reconstituir(guardada)
      : ConfiguracionRecordatorio.predeterminada(
          tenantId,
          usuarioId,
          this.opciones.antelacionesPredeterminadasMin,
        );
  }

  // ---------------------------------------------------------------------------
  // Envío y resultado del proveedor (ADR-13 §8)
  // ---------------------------------------------------------------------------

  private async enviar(
    fila: DatosRecordatorio,
    lectura: Lectura,
    tx: TransactionContext,
  ): Promise<ResultadoEnvioRecordatorio> {
    // Las políticas 1 y 5 ya garantizan cita y correo.
    const datos = lectura.datos as DatosEnvioCita;
    const configuracion = lectura.configuracion as ConfiguracionRecordatorio;
    const destinatario = lectura.politicas.correoPaciente as string;

    const contenido = generarPlantillaRecordatorio({
      inicio: datos.cita.inicio,
      tz: this.opciones.tz,
      profesional: datos.profesional.nombreCompleto,
      organizacion: datos.organizacion.nombre,
      telefonoContacto: configuracion.telefonoContacto,
      correoRespuesta: configuracion.correoRespuesta,
    });
    const mensaje: MensajeSaliente = {
      destinatario,
      asunto: contenido.asunto,
      html: contenido.html,
      texto: contenido.texto,
      responderA: configuracion.correoRespuesta,
      claveIdempotencia: claveIdempotencia(fila.id),
      etiquetas: { recordatorio_id: fila.id },
    };

    const resultado = await this.llamarCanal(fila, mensaje);
    const despues = this.reloj();
    const r = this.d.recordatorios;
    const conProveedor = (
      desenlace: DesenlaceEnvio,
      corte: CorteLote | null = null,
    ): ResultadoEnvioRecordatorio => ({
      recordatorioId: fila.id,
      desenlace,
      llamoProveedor: true,
      corte,
    });

    switch (resultado.tipo) {
      case TipoResultadoEnvio.ACEPTADO:
      case TipoResultadoEnvio.POSIBLE_DUPLICADO: {
        const proveedorMensajeId =
          resultado.tipo === TipoResultadoEnvio.ACEPTADO
            ? resultado.proveedorMensajeId
            : null;
        const ok = await r.registrarEnvio(
          fila.id,
          fila.tenantId,
          { proveedor: resultado.proveedor, proveedorMensajeId },
          despues,
          tx,
        );
        if (resultado.tipo === TipoResultadoEnvio.POSIBLE_DUPLICADO) {
          // ADR-13 §8: ya hubo un envío aceptado con esta clave; el webhook
          // completa el id.
          this.log('warn', 'recordatorio.posible_duplicado', fila, {
            proveedor: resultado.proveedor,
            codigo: resultado.codigo,
          });
        }
        this.log('info', 'recordatorio.enviado', fila, {
          proveedor: resultado.proveedor,
          intentos: fila.intentos + 1,
          conIdProveedor: proveedorMensajeId !== null,
        });
        return conProveedor(ok ? 'enviado' : 'sin_cambios');
      }

      case TipoResultadoEnvio.TRANSITORIO: {
        const decision = calcularReintento({
          intentosPrevios: fila.intentos,
          ahora: despues,
          venceEn: fila.venceEn,
          maxReintentos: this.opciones.maxReintentos,
        });
        if (decision.tipo === 'reintentar') {
          const ok = await r.registrarReintento(
            fila.id,
            fila.tenantId,
            {
              ultimoError: resultado.codigo,
              proximoIntentoEn: decision.proximoIntentoEn,
            },
            tx,
          );
          this.log('warn', 'recordatorio.reintento', fila, {
            proveedor: resultado.proveedor,
            codigo: resultado.codigo,
            reintento: decision.numeroReintento,
            proximoIntentoEn: decision.proximoIntentoEn.toISOString(),
          });
          return conProveedor(ok ? 'reintento' : 'sin_cambios');
        }
        const ok = await r.registrarFallo(
          fila.id,
          fila.tenantId,
          {
            motivo: MotivoRecordatorio.VENCIDO,
            ultimoError: resultado.codigo,
            contarIntento: true,
          },
          tx,
        );
        this.logFallo(
          fila,
          MotivoRecordatorio.VENCIDO,
          null,
          resultado.codigo,
          {
            causa: decision.causa,
          },
        );
        return conProveedor(ok ? 'fallido' : 'sin_cambios');
      }

      case TipoResultadoEnvio.CUOTA_AGOTADA: {
        // ADR-13 §8 y §11: no se reintenta con espera. Se deja de llamar al
        // proveedor hasta el reinicio y este se pospone a ese momento si aún
        // sirve; si no, `fallido` (`cuota_agotada`). Se corta el lote.
        const alcance: 'dia' | 'mes' =
          resultado.alcance === 'mes' ? 'mes' : 'dia';
        const periodo =
          alcance === 'mes' ? periodoMesUtc(despues) : periodoDiaUtc(despues);
        this.bloquearCuota(alcance, periodo.hasta);
        this.alertarCuotaAgotada(alcance, despues, 'proveedor', resultado);

        if (periodo.hasta.getTime() < fila.venceEn.getTime()) {
          const ok = await r.posponer(
            fila.id,
            fila.tenantId,
            periodo.hasta,
            tx,
          );
          this.log('info', 'recordatorio.pospuesto', fila, {
            politica: 'cuota_proveedor',
            codigo: resultado.codigo,
            hasta: periodo.hasta.toISOString(),
          });
          return conProveedor(
            ok ? 'pospuesto' : 'sin_cambios',
            'cuota_agotada',
          );
        }
        const ok = await r.registrarFallo(
          fila.id,
          fila.tenantId,
          {
            motivo: MotivoRecordatorio.CUOTA_AGOTADA,
            ultimoError: resultado.codigo,
            contarIntento: true,
          },
          tx,
        );
        this.logFallo(
          fila,
          MotivoRecordatorio.CUOTA_AGOTADA,
          null,
          resultado.codigo,
        );
        return conProveedor(ok ? 'fallido' : 'sin_cambios', 'cuota_agotada');
      }

      case TipoResultadoEnvio.PERMANENTE: {
        // La supresión de una dirección llega por webhook (rebote o queja,
        // ADR-13 §10): un rechazo síncrono (422/400) no dañó la reputación y
        // la dirección mal formada se corrige con PATCH /pacientes/:id.
        const ok = await r.registrarFallo(
          fila.id,
          fila.tenantId,
          {
            motivo: resultado.motivo,
            ultimoError: resultado.codigo,
            contarIntento: true,
          },
          tx,
        );
        this.logFallo(fila, resultado.motivo, null, resultado.codigo);
        return conProveedor(ok ? 'fallido' : 'sin_cambios');
      }

      case TipoResultadoEnvio.CONFIGURACION: {
        // ADR-13 §8: no se toca el recordatorio ni se suma intento; se corta
        // el lote y se alerta. Si nadie lo arregla, vencen y quedan
        // `fallido` (`vencido`) por la política 2.
        this.d.bitacora.registrar({
          nivel: 'error',
          evento: 'recordatorios.configuracion_proveedor',
          alerta: AlertaRecordatorios.CONFIGURACION,
          campos: {
            proveedor: resultado.proveedor,
            codigo: resultado.codigo,
            recordatorioId: fila.id,
          },
          msg: 'El proveedor de correo rechazó la configuración (clave, remitente o dominio): no se envía nada hasta corregirla',
        });
        return conProveedor('sin_cambios', 'configuracion');
      }
    }
  }

  /**
   * Llama al canal con tope de tiempo. El puerto promete no lanzar por
   * errores del proveedor; si lanza igual (o se pasa del tope), se trata como
   * transitorio: el reintento lo cubre la `Idempotency-Key`.
   */
  private async llamarCanal(
    fila: DatosRecordatorio,
    mensaje: MensajeSaliente,
  ): Promise<ResultadoEnvio> {
    try {
      return await conTiempoLimite(
        this.d.canal.enviar(mensaje),
        this.tiempoMaximoMs,
      );
    } catch (error: unknown) {
      const codigo =
        error instanceof TiempoAgotadoEnvioError
          ? 'tiempo_agotado'
          : `canal:${codigoDeError(error)}`;
      this.log('error', 'recordatorios.canal_lanzo', fila, { codigo });
      return {
        tipo: TipoResultadoEnvio.TRANSITORIO,
        proveedor: 'canal',
        codigo,
      };
    }
  }

  // ---------------------------------------------------------------------------
  // Errores internos: que una fila rota no bloquee la cola
  // ---------------------------------------------------------------------------

  /**
   * Algo lanzó dentro de la transacción del recordatorio (se revirtió). En
   * OTRA transacción se le registra un reintento con el calendario normal
   * (o `fallido` si se agotó), para que no vuelva a la cabeza de la cola en el
   * mismo tick ni la bloquee para siempre. Si esto también falla, es
   * infraestructura y se relanza el error original.
   */
  private async registrarErrorInterno(
    fila: DatosRecordatorio,
    error: unknown,
  ): Promise<ResultadoEnvioRecordatorio> {
    const codigo = `interno:${codigoDeError(error)}`.slice(0, 200);
    try {
      await this.d.transacciones.run(async (tx) => {
        const decision = calcularReintento({
          intentosPrevios: fila.intentos,
          ahora: this.reloj(),
          venceEn: fila.venceEn,
          maxReintentos: this.opciones.maxReintentos,
        });
        if (decision.tipo === 'reintentar') {
          await this.d.recordatorios.registrarReintento(
            fila.id,
            fila.tenantId,
            {
              ultimoError: codigo,
              proximoIntentoEn: decision.proximoIntentoEn,
            },
            tx,
          );
        } else {
          await this.d.recordatorios.registrarFallo(
            fila.id,
            fila.tenantId,
            {
              motivo: MotivoRecordatorio.VENCIDO,
              ultimoError: codigo,
              contarIntento: true,
            },
            tx,
          );
        }
      });
    } catch {
      throw error;
    }
    this.log('error', 'recordatorios.envio_error_interno', fila, { codigo });
    return {
      recordatorioId: fila.id,
      desenlace: 'error_interno',
      llamoProveedor: false,
      corte: null,
    };
  }

  // ---------------------------------------------------------------------------
  // Cuota (ADR-13 §11)
  // ---------------------------------------------------------------------------

  private cuotaBloqueada(alcance: 'dia' | 'mes', ahora: Date): boolean {
    const hasta = this.bloqueoCuota[alcance];
    return hasta !== null && ahora.getTime() < hasta.getTime();
  }

  private bloquearCuota(alcance: 'dia' | 'mes', hasta: Date): void {
    const actual = this.bloqueoCuota[alcance];
    if (actual === null || actual.getTime() < hasta.getTime()) {
      this.bloqueoCuota[alcance] = hasta;
    }
  }

  /** Qué periodo agotado frenó la política 9 (el más tardío manda). */
  private alcanceLocal(lectura: Lectura): 'dia' | 'mes' {
    return lectura.politicas.cuota.enviadosMes >= this.opciones.cuotaMensual
      ? 'mes'
      : 'dia';
  }

  /** `alerta = recordatorios.cuota_agotada` (error), una vez por periodo. */
  private alertarCuotaAgotada(
    alcance: AlcanceCuota,
    ahora: Date,
    origen: 'local' | 'proveedor',
    resultado?: { proveedor: string; codigo: string },
  ): void {
    const periodo =
      alcance === 'mes' ? periodoMesUtc(ahora) : periodoDiaUtc(ahora);
    if (!this.avisos.primeraVez(`cuota_agotada:${alcance}`, periodo)) return;
    this.d.bitacora.registrar({
      nivel: 'error',
      evento: 'recordatorios.cuota_agotada',
      alerta: AlertaRecordatorios.CUOTA_AGOTADA,
      campos: {
        alcance,
        origen,
        reinicio: periodo.hasta.toISOString(),
        ...(resultado
          ? { proveedor: resultado.proveedor, codigo: resultado.codigo }
          : {}),
      },
      msg: 'Cuota de correo agotada: no se llama al proveedor hasta el reinicio',
    });
  }

  /** `alerta = recordatorios.cuota_80` (warn), una vez por periodo y alcance. */
  private avisarCuota80(lectura: Lectura, seEnvio: boolean): void {
    if (lectura.datos === null) return; // no se leyó la cuota
    const extra = seEnvio ? 1 : 0;
    const alcances: {
      alcance: 'dia' | 'mes';
      usados: number;
      cuota: number;
      periodo: Periodo;
    }[] = [
      {
        alcance: 'dia',
        usados: lectura.cuota.enviadosDia + extra,
        cuota: this.opciones.cuotaDiaria,
        periodo: lectura.cuota.dia,
      },
      {
        alcance: 'mes',
        usados: lectura.cuota.enviadosMes + extra,
        cuota: this.opciones.cuotaMensual,
        periodo: lectura.cuota.mes,
      },
    ];
    for (const a of alcances) {
      if (
        alcanzaUmbral(a.usados, a.cuota, this.opciones.umbralAvisoCuota) &&
        this.avisos.primeraVez(`cuota_80:${a.alcance}`, a.periodo)
      ) {
        this.d.bitacora.registrar({
          nivel: 'warn',
          evento: 'recordatorios.cuota_80',
          alerta: AlertaRecordatorios.CUOTA_80,
          campos: {
            alcance: a.alcance,
            usados: a.usados,
            cuota: a.cuota,
            umbral: this.opciones.umbralAvisoCuota,
          },
          msg: 'Se alcanzó el umbral de aviso de la cuota de correo',
        });
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Logs
  // ---------------------------------------------------------------------------

  private desenlace(
    fila: DatosRecordatorio,
    desenlace: DesenlaceEnvio,
  ): ResultadoEnvioRecordatorio {
    return {
      recordatorioId: fila.id,
      desenlace,
      llamoProveedor: false,
      corte: null,
    };
  }

  private logFallo(
    fila: DatosRecordatorio,
    motivo: MotivoFallo,
    politica: NombrePoliticaEnvio | null,
    codigo: string | null,
    extra: Record<string, ValorCampoBitacora> = {},
  ): void {
    this.log('warn', 'recordatorio.fallido', fila, {
      motivo,
      politica,
      codigo,
      ...extra,
    });
  }

  private log(
    nivel: 'info' | 'warn' | 'error',
    evento: string,
    fila: DatosRecordatorio,
    campos: Record<string, ValorCampoBitacora>,
  ): void {
    this.d.bitacora.registrar({
      nivel,
      evento,
      campos: {
        recordatorioId: fila.id,
        citaId: fila.citaId,
        tenantId: fila.tenantId,
        antelacionMin: fila.antelacionMin,
        intentos: fila.intentos,
        ...campos,
      },
      msg: evento,
    });
  }
}

function contar(
  resultado: ResultadoLoteEnvio,
  desenlace: DesenlaceEnvio,
): void {
  switch (desenlace) {
    case 'enviado':
      resultado.enviados++;
      break;
    case 'reintento':
      resultado.reintentos++;
      break;
    case 'pospuesto':
      resultado.pospuestos++;
      break;
    case 'omitido':
      resultado.omitidos++;
      break;
    case 'cancelado':
      resultado.cancelados++;
      break;
    case 'fallido':
      resultado.fallidos++;
      break;
    case 'sin_cambios':
      resultado.sinCambios++;
      break;
    case 'error_interno':
      resultado.erroresInternos++;
      break;
  }
}

function esperarMs(ms: number): Promise<void> {
  return ms <= 0
    ? Promise.resolve()
    : new Promise((resolver) => setTimeout(resolver, ms));
}

/** Rechaza con `TiempoAgotadoEnvioError` si `promesa` tarda más de `ms`. */
function conTiempoLimite<T>(promesa: Promise<T>, ms: number): Promise<T> {
  let temporizador: ReturnType<typeof setTimeout> | undefined;
  const limite = new Promise<never>((_, rechazar) => {
    temporizador = setTimeout(
      () => rechazar(new TiempoAgotadoEnvioError()),
      ms,
    );
    temporizador.unref?.();
  });
  return Promise.race([promesa, limite]).finally(() =>
    clearTimeout(temporizador),
  );
}
