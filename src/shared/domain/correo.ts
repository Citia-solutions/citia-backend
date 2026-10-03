// Utilidades puras para direcciones de correo (ADR-13 §2 y §14).
//
// Sin dependencias de framework, igual que rut.ts. La VALIDACION de formato la
// hace la capa de presentacion (`@IsEmail()` de class-validator); aqui solo
// vive la forma canonica, para que el dominio y los adaptadores comparen y
// guarden lo mismo.

/**
 * Lleva un correo a su forma normalizada: sin espacios alrededor y en
 * minusculas.
 *
 *   '  Ana.Soto@Mail.CL ' -> 'ana.soto@mail.cl'
 *
 * Es la forma en que se guarda el correo del paciente y la que ADR-13 §2 usa
 * para el hash de `supresiones_correo`. La parte local es sensible a
 * mayusculas segun la RFC 5321, pero ningun proveedor de uso comun la trata
 * asi; normalizar evita que "Ana@" y "ana@" cuenten como correos distintos.
 */
export function normalizarCorreo(correo: string): string {
  return correo.trim().toLowerCase();
}
