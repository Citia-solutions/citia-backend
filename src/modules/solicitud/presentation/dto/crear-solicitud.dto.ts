import {
  Equals,
  IsEmail,
  IsNotEmpty,
  IsString,
  MaxLength,
} from 'class-validator';

import { VersionTerminosVigente } from '../../../paciente/presentation/dto/version-terminos.decorator';

/**
 * Cuerpo del formulario público del paciente.
 *
 * ⚠️ PROVISIONAL. Los campos son los definidos en ADR-09 §10; el formulario
 * del frontend todavía no está cerrado. Cuando lo esté, este DTO se ajusta —
 * es el único archivo del backend que hay que tocar para cambiar la forma de
 * entrada. Los `@MaxLength` están copiados en el frontend (`LIMITES` en
 * `citia-frontend/src/features/crear-cita/model/flujoCitaModel.ts`, DTF-06):
 * si cambian aquí, cambiar allá en el mismo cambio.
 *
 * Todos obligatorios por ahora, incluido el RUT: es el filtro estructural de
 * entrada de la vía pública, que asume personas chilenas.
 */
export class CrearSolicitudDto {
  @IsString()
  @IsNotEmpty()
  rut: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  nombrePaciente: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  telefono: string;

  @IsEmail()
  @IsNotEmpty()
  correo: string;

  /**
   * Texto libre acotado. El límite es intencional: sin él, una caja grande en
   * una página que circula por redes invita a escribir una historia clínica
   * completa, que quedaría almacenada incluso si la solicitud se rechaza.
   */
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  motivo: string;

  /** "mañanas", "jueves después de las 15h". Sustituye a elegir hora. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  preferenciaHoraria: string;

  /**
   * Requisito legal, y aquí lo marca el titular del dato. Desde US-11 (ADR-16
   * §5, D5) tiene que ser `true`: un `false` responde 400 del
   * `ValidationPipe`, ANTES de buscar la organización (el 202 sigue
   * uniforme).
   */
  @Equals(true, {
    message: 'Debes aceptar los términos de uso y el aviso de privacidad',
  })
  consentimiento: boolean;

  /**
   * Versión de los términos que mostró el formulario (US-11, ADR-16 §5).
   * Obligatoria y del catálogo, con una versión que recibe aceptaciones; si
   * no, 400 con `MENSAJE_VERSION_TERMINOS_NO_VIGENTE` (también antes de
   * buscar la organización). Se guarda en `solicitudes_cita.terminos_version`
   * y la aceptación nace al aceptar la solicitud en la bandeja (D10).
   */
  @VersionTerminosVigente()
  terminosVersion: string;
}
