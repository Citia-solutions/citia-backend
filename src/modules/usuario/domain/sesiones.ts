/**
 * Corte de sesiones (US-10, ADR-15 §5). Funciones puras: sin reloj propio ni
 * dependencias; el reloj lo pone quien llama.
 *
 * `usuarios.sesiones_validas_desde` guarda desde cuándo valen los tokens de un
 * usuario. `NULL` = sin corte (todos los existentes al migrar y los recién
 * registrados). Solo lo escribe el cambio de contraseña.
 *
 * El `iat` de un JWT está en SEGUNDOS y la columna admite microsegundos: por
 * eso el corte se guarda truncado al segundo y el token nuevo se firma con
 * `iat` = ese mismo segundo (opción B1). Así el token nuevo siempre vale, y un
 * token emitido en el mismo segundo del cambio, pero antes, también: ventana
 * de menos de 1 segundo, aceptada.
 */

/** `ahora` truncado al segundo: el valor que se guarda como corte. */
export function inicioSesionesValidas(ahora: Date): Date {
  return new Date(Math.floor(ahora.getTime() / 1000) * 1000);
}

/**
 * ¿Sigue valiendo un token emitido en `iat` (segundos desde la época) para un
 * usuario con este corte?
 *
 *  - corte nulo → vale (también sin `iat`);
 *  - con corte y sin `iat` (o no numérico) → no vale: todo token que firma
 *    Citia lo trae;
 *  - si no, vale si `iat × 1000 ≥ corte`.
 *
 * Un corte que no es una fecha válida no deja pasar a nadie (falla cerrado).
 */
export function tokenEmitidoVigente(
  iat: number | undefined,
  sesionesValidasDesde: Date | null,
): boolean {
  if (sesionesValidasDesde === null) {
    return true;
  }
  if (typeof iat !== 'number' || !Number.isFinite(iat)) {
    return false;
  }
  return iat * 1000 >= sesionesValidasDesde.getTime();
}
