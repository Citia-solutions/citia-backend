// Políticas de envío (ADR-13 §7, paso 3): se evalúan EN ORDEN justo antes de
// llamar al proveedor, sobre datos recién releídos. Puras: reciben todo ya
// leído (cita, correo, supresión, conteos) y devuelven una decisión. El caso
// de uso de envío (paso 10) hace las lecturas y aplica la decisión con su
// transacción.
import { HorasSinEnvio, ventanaDeSilencio } from './horas-sin-envio';
import {
  MotivoCancelacion,
  MotivoFallo,
  MotivoOmision,
  MotivoRecordatorio,
} from './recordatorio.entity';

/** Lo que responde una política. */
export type DecisionPolitica =
  | { tipo: 'continuar' }
  | { tipo: 'cancelar'; motivo: MotivoCancelacion }
  | { tipo: 'omitir'; motivo: MotivoOmision }
  | { tipo: 'posponer'; hasta: Date }
  | { tipo: 'fallar'; motivo: MotivoFallo };

/** Lo que resulta de evaluar todas: la primera que no continúa, o enviar. */
export type DecisionEnvio =
  | Exclude<DecisionPolitica, { tipo: 'continuar' }>
  | { tipo: 'enviar' };

/** Conteo local de la cuota del proveedor (ADR-13 §11), ya calculado. */
export interface EstadoCuota {
  /** Enviados en el periodo diario (UTC) y mensual (UTC) en curso. */
  enviadosDia: number;
  enviadosMes: number;
  /** Cuándo reinicia cada periodo (`periodoDiaUtc(ahora).hasta`, …). */
  reinicioDia: Date;
  reinicioMes: Date;
}

/** Todo lo que las políticas miran, YA LEÍDO con el `tenantId` de la fila. */
export interface ContextoEnvio {
  ahora: Date;
  recordatorio: { inicioCita: Date; venceEn: Date };
  /** La cita releída; `null` si ya no existe. */
  cita: { inicio: Date; vigente: boolean } | null;
  /** La del profesional dueño (o la predeterminada). */
  configuracion: { activo: boolean };
  /** Correo del paciente; `null` si falta o está en blanco. */
  correoPaciente: string | null;
  consentimientoPaciente: boolean;
  /** `SupresionCorreoRepository.existe(calcularHashCorreo(correo))`; `false` sin correo. */
  correoSuprimido: boolean;
  /** Enviados hoy por el tenant (día de la clínica, `periodoDiaEnZona`). */
  enviadosHoyTenant: number;
  cuota: EstadoCuota;
}

export type NombrePoliticaEnvio =
  | 'vigencia_cita'
  | 'vencimiento'
  | 'configuracion_activa'
  | 'horas_sin_envio'
  | 'correo_presente'
  | 'no_suprimido'
  | 'consentimiento'
  | 'limite_tenant'
  | 'cuota_proveedor';

/** Una regla que puede impedir (o aplazar) un envío. */
export interface PoliticaEnvio {
  readonly nombre: NombrePoliticaEnvio;
  evaluar(contexto: ContextoEnvio): DecisionPolitica;
}

const CONTINUAR: DecisionPolitica = { tipo: 'continuar' };

/**
 * 1. La cita existe, está vigente y su `inicio` es el del recordatorio.
 * Si no: `cancelado` (`cita_terminal`, o `reprogramado` si se movió).
 */
export class PoliticaVigenciaCita implements PoliticaEnvio {
  readonly nombre = 'vigencia_cita';

  evaluar({ cita, recordatorio }: ContextoEnvio): DecisionPolitica {
    if (!cita || !cita.vigente) {
      return { tipo: 'cancelar', motivo: MotivoRecordatorio.CITA_TERMINAL };
    }
    if (cita.inicio.getTime() !== recordatorio.inicioCita.getTime()) {
      return { tipo: 'cancelar', motivo: MotivoRecordatorio.REPROGRAMADO };
    }
    return CONTINUAR;
  }
}

/** 2. `ahora < venceEn`. Si no: `fallido` (`vencido`). */
export class PoliticaVencimiento implements PoliticaEnvio {
  readonly nombre = 'vencimiento';

  evaluar({ ahora, recordatorio }: ContextoEnvio): DecisionPolitica {
    return ahora.getTime() < recordatorio.venceEn.getTime()
      ? CONTINUAR
      : { tipo: 'fallar', motivo: MotivoRecordatorio.VENCIDO };
  }
}

/** 3. La configuración del profesional está encendida. Si no: `cancelado` (`desactivado`). */
export class PoliticaConfiguracionActiva implements PoliticaEnvio {
  readonly nombre = 'configuracion_activa';

  evaluar({ configuracion }: ContextoEnvio): DecisionPolitica {
    return configuracion.activo
      ? CONTINUAR
      : { tipo: 'cancelar', motivo: MotivoRecordatorio.DESACTIVADO };
  }
}

/**
 * 4. Fuera de las horas sin envío (cubre reintentos y tardíos, que no pasan
 * por el ajuste de la planificación). Dentro: posponer al fin del silencio si
 * queda antes de `venceEn`; si no, `fallido` (`vencido`).
 */
export class PoliticaHorasSinEnvio implements PoliticaEnvio {
  readonly nombre = 'horas_sin_envio';

  constructor(
    private readonly tz: string,
    private readonly silencio: HorasSinEnvio,
  ) {}

  evaluar({ ahora, recordatorio }: ContextoEnvio): DecisionPolitica {
    const ventana = ventanaDeSilencio(ahora, this.silencio, this.tz);
    if (!ventana) return CONTINUAR;
    return ventana.hasta.getTime() < recordatorio.venceEn.getTime()
      ? { tipo: 'posponer', hasta: ventana.hasta }
      : { tipo: 'fallar', motivo: MotivoRecordatorio.VENCIDO };
  }
}

/** 5. El paciente tiene correo. Si no: `omitido` (`sin_correo`). */
export class PoliticaCorreoPresente implements PoliticaEnvio {
  readonly nombre = 'correo_presente';

  evaluar({ correoPaciente }: ContextoEnvio): DecisionPolitica {
    return correoPaciente !== null && correoPaciente.trim() !== ''
      ? CONTINUAR
      : { tipo: 'omitir', motivo: MotivoRecordatorio.SIN_CORREO };
  }
}

/** 6. La dirección no está suprimida (rebote o queja). Si no: `omitido` (`correo_suprimido`). */
export class PoliticaNoSuprimido implements PoliticaEnvio {
  readonly nombre = 'no_suprimido';

  evaluar({ correoSuprimido }: ContextoEnvio): DecisionPolitica {
    return correoSuprimido
      ? { tipo: 'omitir', motivo: MotivoRecordatorio.CORREO_SUPRIMIDO }
      : CONTINUAR;
  }
}

/**
 * 7. Consentimiento del paciente. **Apagada por defecto**
 * (`RECORDATORIO_EXIGIR_CONSENTIMIENTO=false`, riesgo aceptado: ADR-13 §15,
 * DT-16): con `exigir = false` siempre continúa. Encendida y sin
 * consentimiento: `omitido` (`sin_consentimiento`).
 */
export class PoliticaConsentimiento implements PoliticaEnvio {
  readonly nombre = 'consentimiento';

  constructor(private readonly exigir: boolean) {}

  evaluar({ consentimientoPaciente }: ContextoEnvio): DecisionPolitica {
    if (!this.exigir || consentimientoPaciente) return CONTINUAR;
    return { tipo: 'omitir', motivo: MotivoRecordatorio.SIN_CONSENTIMIENTO };
  }
}

/**
 * 8. Fusible diario por organización (`RECORDATORIO_MAX_DIARIO_POR_TENANT`,
 * 40). Al llegar al tope: `omitido` (`limite_tenant`).
 */
export class PoliticaLimiteTenant implements PoliticaEnvio {
  readonly nombre = 'limite_tenant';

  constructor(private readonly maxDiario: number) {}

  evaluar({ enviadosHoyTenant }: ContextoEnvio): DecisionPolitica {
    return enviadosHoyTenant < this.maxDiario
      ? CONTINUAR
      : { tipo: 'omitir', motivo: MotivoRecordatorio.LIMITE_TENANT };
  }
}

/**
 * 9. Cuota del proveedor según el contador local (`RESEND_CUOTA_DIARIA` /
 * `_MENSUAL`). Agotada: posponer al reinicio (el más tardío de los periodos
 * agotados) si llega antes de `venceEn`; si no, `fallido` (`cuota_agotada`).
 * No es un reintento con espera: un recordatorio tardío no sirve.
 */
export class PoliticaCuotaProveedor implements PoliticaEnvio {
  readonly nombre = 'cuota_proveedor';

  constructor(
    private readonly cuotaDiaria: number,
    private readonly cuotaMensual: number,
  ) {}

  evaluar({ cuota, recordatorio }: ContextoEnvio): DecisionPolitica {
    const reinicios: number[] = [];
    if (cuota.enviadosDia >= this.cuotaDiaria) {
      reinicios.push(cuota.reinicioDia.getTime());
    }
    if (cuota.enviadosMes >= this.cuotaMensual) {
      reinicios.push(cuota.reinicioMes.getTime());
    }
    if (reinicios.length === 0) return CONTINUAR;
    const reinicio = Math.max(...reinicios);
    return reinicio < recordatorio.venceEn.getTime()
      ? { tipo: 'posponer', hasta: new Date(reinicio) }
      : { tipo: 'fallar', motivo: MotivoRecordatorio.CUOTA_AGOTADA };
  }
}

/** Parámetros (entorno) de las políticas. */
export interface ParametrosPoliticasEnvio {
  tz: string;
  silencio: HorasSinEnvio;
  /** `RECORDATORIO_EXIGIR_CONSENTIMIENTO` (false). */
  exigirConsentimiento: boolean;
  /** `RECORDATORIO_MAX_DIARIO_POR_TENANT` (40). */
  maxDiarioPorTenant: number;
  /** `RESEND_CUOTA_DIARIA` (100) y `RESEND_CUOTA_MENSUAL` (3000). */
  cuotaDiaria: number;
  cuotaMensual: number;
}

/** Las nueve políticas de ADR-13 §7, en su orden. */
export function crearPoliticasEnvio(
  parametros: ParametrosPoliticasEnvio,
): readonly PoliticaEnvio[] {
  return [
    new PoliticaVigenciaCita(),
    new PoliticaVencimiento(),
    new PoliticaConfiguracionActiva(),
    new PoliticaHorasSinEnvio(parametros.tz, parametros.silencio),
    new PoliticaCorreoPresente(),
    new PoliticaNoSuprimido(),
    new PoliticaConsentimiento(parametros.exigirConsentimiento),
    new PoliticaLimiteTenant(parametros.maxDiarioPorTenant),
    new PoliticaCuotaProveedor(parametros.cuotaDiaria, parametros.cuotaMensual),
  ];
}

/**
 * Evalúa en orden y devuelve la decisión de la PRIMERA política que no
 * continúa, junto con su nombre (para el log); `enviar` si todas continúan.
 */
export function evaluarPoliticasEnvio(
  politicas: readonly PoliticaEnvio[],
  contexto: ContextoEnvio,
): DecisionEnvio & { politica: NombrePoliticaEnvio | null } {
  for (const politica of politicas) {
    const decision = politica.evaluar(contexto);
    if (decision.tipo !== 'continuar') {
      return { ...decision, politica: politica.nombre };
    }
  }
  return { tipo: 'enviar', politica: null };
}
