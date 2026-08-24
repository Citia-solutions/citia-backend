export class Paciente {
  id: string;
  // RUT en forma canonica (ver shared/domain/rut.ts). Opcional: el alta manual
  // admite personas sin RUT; el formulario publico lo exige (ADR-09 §3).
  rut?: string | null;
  nombre: string;
  telefono: string;
  correo?: string | null;
  consentimiento: boolean;
  tenantId: string;
}
