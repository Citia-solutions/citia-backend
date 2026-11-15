import { VersionTerminosVigente } from '../../../paciente/presentation/dto/version-terminos.decorator';

/**
 * Cuerpo de `POST /publico/cita/aceptar-terminos` (US-11, ADR-16 §8): la
 * versión de los términos que mostró la tarjeta de `/cita`. Obligatoria y del
 * catálogo, con una versión que recibe aceptaciones; si no, 400 del
 * `ValidationPipe` con `MENSAJE_VERSION_TERMINOS_NO_VIGENTE`, ANTES de mirar
 * el token (no revela nada del enlace).
 */
export class AceptarTerminosDto {
  @VersionTerminosVigente()
  terminosVersion: string;
}
