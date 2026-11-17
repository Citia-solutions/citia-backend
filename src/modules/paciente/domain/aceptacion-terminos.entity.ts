import { VersionTerminosNoVigenteError } from './exceptions/version-terminos-no-vigente.error';
import {
  CATALOGO_TERMINOS_PACIENTE,
  VersionTerminosPaciente,
  esVersionConocida,
  recibeAceptaciones,
} from './terminos-paciente';

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

/** Lo común a una aceptación nueva, sea cual sea el canal. */
interface RegistrarAceptacionBase {
  tenantId: string;
  pacienteId: string;
  /** Versión del catálogo (`terminos-paciente.ts`). */
  version: string;
  /** El acto (ver `AceptacionTerminos.aceptadaEn`). */
  aceptadaEn: Date;
}

/**
 * Una aceptación NUEVA (US-11, ADR-16 §3): unión discriminada por `canal`,
 * cada uno con SU referencia y ninguna otra. Así el compilador impide, por
 * ejemplo, una aceptación del profesional sin usuario o con una solicitud.
 */
export type RegistrarAceptacionProps =
  | (RegistrarAceptacionBase & {
      canal: CanalAceptacion.FORMULARIO_PUBLICO;
      /** La solicitud del formulario que trajo la versión. */
      solicitudId: string;
    })
  | (RegistrarAceptacionBase & {
      canal: CanalAceptacion.ENLACE_CITA;
      /** El enlace de la cita con el que se aceptó. */
      enlaceId: string;
    })
  | (RegistrarAceptacionBase & {
      canal: CanalAceptacion.PROFESIONAL;
      /** El usuario del token que marcó la casilla. */
      usuarioId: string;
    });

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

  /**
   * Fábrica de una aceptación NUEVA (sin `id` ni `registradaEn`: los pone la
   * base). Las referencias que no son de su canal quedan en `null` (no
   * `undefined`), como exige `CHK_aceptaciones_terminos_referencia`.
   *
   * Versión, según el canal (ADR-16 §2):
   *  - `formulario_publico`: basta con que la versión sea CONOCIDA. La
   *    solicitud pudo enviarse antes de que esa versión dejara de recibir
   *    aceptaciones, y lo que se registra es el acto de entonces.
   *  - `enlace_cita` y `profesional`: la versión tiene que RECIBIR
   *    aceptaciones (el acto es ahora).
   *
   * `catalogo`: solo para los tests (por defecto, el vigente).
   *
   * @throws VersionTerminosNoVigenteError si la versión no sirve para el
   *   canal (también vacía o ausente). El controller → 400.
   * @throws RangeError si falta la referencia del canal, el canal no existe o
   *   `aceptadaEn` no es una fecha válida: invariantes de quien llama (500).
   */
  static registrar(
    props: RegistrarAceptacionProps,
    catalogo: readonly VersionTerminosPaciente[] = CATALOGO_TERMINOS_PACIENTE,
  ): AceptacionTerminos {
    if (!Object.values(CanalAceptacion).includes(props.canal)) {
      throw new RangeError('AceptacionTerminos: canal desconocido');
    }

    const versionValida =
      props.canal === CanalAceptacion.FORMULARIO_PUBLICO
        ? esVersionConocida(props.version, catalogo)
        : recibeAceptaciones(props.version, catalogo);
    if (!versionValida) {
      throw new VersionTerminosNoVigenteError();
    }

    if (
      !(props.aceptadaEn instanceof Date) ||
      Number.isNaN(props.aceptadaEn.getTime())
    ) {
      throw new RangeError('AceptacionTerminos: aceptadaEn no es una fecha');
    }

    const aceptacion = new AceptacionTerminos();
    aceptacion.tenantId = props.tenantId;
    aceptacion.pacienteId = props.pacienteId;
    aceptacion.version = props.version;
    aceptacion.canal = props.canal;
    aceptacion.aceptadaEn = props.aceptadaEn;
    aceptacion.solicitudId = null;
    aceptacion.enlaceId = null;
    aceptacion.usuarioId = null;

    switch (props.canal) {
      case CanalAceptacion.FORMULARIO_PUBLICO:
        aceptacion.solicitudId = exigirReferencia(
          props.solicitudId,
          'solicitudId',
        );
        break;
      case CanalAceptacion.ENLACE_CITA:
        aceptacion.enlaceId = exigirReferencia(props.enlaceId, 'enlaceId');
        break;
      case CanalAceptacion.PROFESIONAL:
        aceptacion.usuarioId = exigirReferencia(props.usuarioId, 'usuarioId');
        break;
    }
    return aceptacion;
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

/** La referencia del canal: un texto no vacío. Sin ella, `RangeError`. */
function exigirReferencia(valor: unknown, campo: string): string {
  if (typeof valor !== 'string' || valor.trim() === '') {
    throw new RangeError(
      `AceptacionTerminos: falta la referencia del canal (${campo})`,
    );
  }
  return valor;
}
