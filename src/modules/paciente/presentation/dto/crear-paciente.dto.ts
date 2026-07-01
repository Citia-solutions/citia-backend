import { IsBoolean, IsNotEmpty, IsString } from 'class-validator';

export class CrearPacienteDto {
  @IsString()
  @IsNotEmpty()
  nombre: string;

  @IsString()
  @IsNotEmpty()
  contacto: string;

  @IsBoolean()
  consentimiento: boolean;
}
