export class PacienteResponseDto {
  id: string;
  // Formateado para mostrar (12.345.678-5); en BD vive canonico.
  rut: string | null;
  nombre: string;
  telefono: string;
  correo: string | null;
  consentimiento: boolean;
  tenantId: string;

  constructor(partial: PacienteResponseDto) {
    Object.assign(this, partial);
  }
}
