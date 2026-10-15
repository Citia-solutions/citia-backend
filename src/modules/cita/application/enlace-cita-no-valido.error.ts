/**
 * El enlace del paciente ya no permite actuar sobre la cita (revocado, de
 * otra cita, cita terminal o `inicio` ya pasado), o no es de esa cita.
 *
 * Lo lanzan `CitasService.confirmarComoPaciente` / `cancelarComoPaciente` como
 * defensa en profundidad: `EnlacesCitaService.resolver` ya lo comprobó en el
 * mismo tx, pero el caso de uso no confía en que quien llama lo hizo. El
 * portal lo traduce al MISMO 404 que un token inválido ("Enlace no válido o
 * vencido"). El mensaje no lleva ids: no hay nada que revelar.
 */
export class EnlaceCitaNoValidoError extends Error {
  constructor() {
    super('Enlace no válido o vencido');
    this.name = 'EnlaceCitaNoValidoError';
  }
}
