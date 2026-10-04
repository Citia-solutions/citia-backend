// Utilidades puras para el RUT chileno (ADR-09 decision 3).
//
// Sin dependencias de framework ni librerias externas, igual que slug.ts y
// timezone.ts. El RUT es la identidad del paciente y, a la vez, el filtro de
// entrada del formulario publico: su digito verificador se comprueba con
// aritmetica pura, sin base de datos ni servicio externo.

// Forma canonica aceptada: 6 a 9 digitos de cuerpo + digito verificador.
// El rango es permisivo a proposito (personas mayores tienen cuerpos mas
// cortos, las empresas mas largos); el filtro real es el digito verificador.
const FORMATO_CANONICO = /^\d{6,9}[0-9k]$/;

/**
 * Lleva un RUT a su forma canonica: solo digitos y el verificador, sin puntos
 * ni guion, con la `k` en minuscula.
 *
 *   '12.345.678-K' -> '12345678k'
 *   '12345678-5'   -> '123456785'
 *
 * Es la unica forma en la que el RUT se almacena y se compara.
 */
export function normalizarRut(rut: string): string {
  return rut.replace(/[^0-9kK]/g, '').toLowerCase();
}

/**
 * Valida el digito verificador con el algoritmo modulo 11.
 *
 * Rechaza un RUT inventado sin consultar nada. No verifica titularidad: que el
 * RUT sea valido no significa que pertenezca a quien lo escribe (ver DT-23).
 */
export function esRutValido(rut: string): boolean {
  const limpio = normalizarRut(rut);
  if (!FORMATO_CANONICO.test(limpio)) return false;

  const cuerpo = limpio.slice(0, -1); //1.123.993  extrae todo el rut menos el digito verificador
  const digitoVerificador = limpio.slice(-1); //Extrae solo el digito verificador

  //!Algoritmo del Módulo 11
  // Serie de multiplicadores 2,3,4,5,6,7 que se repite de derecha a izquierda.
  let suma = 0;
  let multiplicador = 2;
  for (let i = cuerpo.length - 1; i >= 0; i -= 1) {
    suma += Number(cuerpo[i]) * multiplicador;
    multiplicador = multiplicador === 7 ? 2 : multiplicador + 1;
  }

  const resto = 11 - (suma % 11);
  const esperado = resto === 11 ? '0' : resto === 10 ? 'k' : String(resto);

  return digitoVerificador === esperado;
}

/**
 * Formatea un RUT canonico para mostrarlo: '12345678k' -> '12.345.678-K'.
 * Solo presentacion; nunca se persiste en este formato.
 */
export function formatearRut(rut: string): string {
  const limpio = normalizarRut(rut);
  if (!FORMATO_CANONICO.test(limpio)) return rut;

  const cuerpo = limpio.slice(0, -1);
  const digitoVerificador = limpio.slice(-1).toUpperCase();

  const conPuntos = cuerpo.replace(/\B(?=(\d{3})+(?!\d))/g, '.');

  return `${conPuntos}-${digitoVerificador}`;
}
