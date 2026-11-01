/**
 * Error de dominio: el `UPDATE` condicional al hash leído no escribió (US-10,
 * ADR-15 §4, paso 7): otra petición cambió la contraseña entretanto. El
 * controller lo traduce a 409.
 */
export class ContrasenaCambiadaEnParaleloError extends Error {
  constructor() {
    super('Tu contraseña cambió mientras tanto; vuelve a intentarlo');
    this.name = 'ContrasenaCambiadaEnParaleloError';
  }
}
