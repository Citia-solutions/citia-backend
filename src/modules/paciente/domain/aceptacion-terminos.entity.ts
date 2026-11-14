/**
 * Por dónde llegó una aceptación de los términos del paciente (US-11,
 * ADR-16 §3). Cada canal lleva exactamente UNA referencia:
 *
 * | Canal                | Quién acepta                       | Referencia    |
 * |----------------------|------------------------------------|---------------|
 * | `formulario_publico` | el paciente, al pedir hora         | `solicitudId` |
 * | `enlace_cita`        | quien tiene el enlace de la cita   | `enlaceId`    |
 * | `profesional`        | el profesional, en nombre de él    | `usuarioId`   |
 *
 * Los valores son los del CHECK `CHK_aceptaciones_terminos_canal` (migración
 * 1750000021000): si cambian aquí, cambian allá.
 */
export enum CanalAceptacion {
  FORMULARIO_PUBLICO = 'formulario_publico',
  ENLACE_CITA = 'enlace_cita',
  PROFESIONAL = 'profesional',
}

/**
 * Los canales en que acepta el propio titular (ADR-16 §3). La aceptación del
 * canal `profesional` NO cuenta para dejar de pedirla en `/cita`.
 */
export const CANALES_DEL_TITULAR: readonly CanalAceptacion[] = [
  CanalAceptacion.FORMULARIO_PUBLICO,
  CanalAceptacion.ENLACE_CITA,
];

/**
 * Fila de `aceptaciones_terminos` ya armada. Uso exclusivo de la persistencia
 * y de los dobles de test: una aceptación nueva se arma con `registrar`.
 */
export interface ReconstituirAceptacionTerminosProps {
  id?: string;
  tenantId: string;
  pacienteId: string;
  version: string;
  canal: CanalAceptacion;
  aceptadaEn: Date;
  usuarioId: string | null;
  solicitudId: string | null;
  enlaceId: string | null;
  registradaEn?: Date;
}

/**
 * Una aceptación de los términos del paciente: qué versión, cuándo y por qué
 * canal (US-11, ADR-16 §3). Es la PRUEBA: solo se inserta, nunca se
 * actualiza ni se borra (`AceptacionTerminosRepository` no tiene `UPDATE` ni
 * `DELETE`).
 *
 * Clase de datos, con los mismos campos que la tabla. Las referencias que no
 * son de su canal van en `null` (`CHK_aceptaciones_terminos_referencia`).
 *
 * Se construye con la fábrica `registrar(props)` (valida la versión contra el
 * catálogo y la referencia del canal) o con `reconstituir` (persistencia y
 * dobles). El constructor es privado.
 */
export class AceptacionTerminos {
  /** Lo pone la base al insertar: `undefined` en una recién registrada. */
  id?: string;
  tenantId: string;
  pacienteId: string;
  /** Versión del catálogo de términos (`'1.0'`). */
  version: string;
  canal: CanalAceptacion;
  /**
   * El acto: `solicitudes_cita.recibida_en` (formulario), el reloj del portal
   * (enlace) o el de la app (profesional). No es cuándo se escribió la fila.
   */
  aceptadaEn: Date;
  /** Solo en `profesional`: quién marcó la casilla. */
  usuarioId: string | null;
  /** Solo en `formulario_publico`: la solicitud que la trajo. */
  solicitudId: string | null;
  /** Solo en `enlace_cita`: el enlace con el que se aceptó. */
  enlaceId: string | null;
  /** La pone la base (`DEFAULT now()`): `undefined` antes de insertar. */
  registradaEn?: Date;

  private constructor() {
    // Se construye vía registrar() o reconstituir().
  }

  /** Uso exclusivo de la persistencia y de los dobles de test. */
  static reconstituir(
    props: ReconstituirAceptacionTerminosProps,
  ): AceptacionTerminos {
    const aceptacion = new AceptacionTerminos();
    aceptacion.id = props.id;
    aceptacion.tenantId = props.tenantId;
    aceptacion.pacienteId = props.pacienteId;
    aceptacion.version = props.version;
    aceptacion.canal = props.canal;
    aceptacion.aceptadaEn = props.aceptadaEn;
    aceptacion.usuarioId = props.usuarioId;
    aceptacion.solicitudId = props.solicitudId;
    aceptacion.enlaceId = props.enlaceId;
    aceptacion.registradaEn = props.registradaEn;
    return aceptacion;
  }
}
