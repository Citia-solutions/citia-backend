import {
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsString,
  MaxLength,
} from 'class-validator';

/**
 * Cuerpo del formulario público del paciente.
 *
 * ⚠️ PROVISIONAL. Los campos son los definidos en ADR-09 §10; el formulario
 * del frontend todavía no está cerrado. Cuando lo esté, este DTO se ajusta —
 * es el único archivo que hay que tocar para cambiar la forma de entrada.
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

  /** Requisito legal, y aquí lo marca el titular del dato. */
  @IsBoolean()
  consentimiento: boolean;
}
