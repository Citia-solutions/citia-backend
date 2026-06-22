import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

import { TipoTenant } from '../../../tenant/domain/tenant.entity';

export class RegistroUsuarioDto {
  @IsString()
  @IsNotEmpty()
  nombreTenant: string;

  @IsOptional()
  @IsEnum(TipoTenant)
  tipoTenant?: TipoTenant;

  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @MinLength(8)
  @IsNotEmpty()
  password: string;

  @IsString()
  @IsNotEmpty()
  nombreCompleto: string;
}
