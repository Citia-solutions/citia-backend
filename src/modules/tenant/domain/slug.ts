/**
 * Genera un slug base a partir de un nombre arbitrario.
 *
 * - lowercase + trim
 * - remueve diacriticos (acentos) via normalizacion NFKD
 * - reemplaza secuencias de caracteres no [a-z0-9] por un unico '-'
 * - poda guiones de los extremos
 * - fallback a 'tenant' si el resultado queda vacio
 *
 * Funcion pura de dominio: sin dependencias externas.
 */
export function slugify(nombre: string): string {
  const base = nombre
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return base || 'tenant';
}
