export class PacienteResponseDto {
  id: string;
  nombre: string;
  contacto: string;
  consentimiento: boolean;
  tenantId: string;

  constructor(partial: PacienteResponseDto) {
    Object.assign(this, partial);
  }
}
