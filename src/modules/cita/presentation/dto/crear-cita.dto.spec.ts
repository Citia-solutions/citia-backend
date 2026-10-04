// `@Type` de class-transformer lee metadata de diseño; en la app la carga Nest.
import 'reflect-metadata';

import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { DURACION_MAXIMA_MIN } from '../../domain/cita.entity';
import { CrearCitaDto } from './crear-cita.dto';

const valido = {
  inicio: '2026-09-22T10:00:00-03:00',
  duracionMin: 50,
  tipoConsulta: 'Control',
  pacienteId: '7c1e0000-0000-4000-8000-000000000001',
};

// Constraints que fallan en `duracionMin` (el resto del cuerpo es válido).
const erroresDuracion = async (duracionMin: unknown): Promise<string[]> => {
  const dto = plainToInstance(CrearCitaDto, { ...valido, duracionMin });
  const resultado = await validate(dto, { whitelist: true });
  const error = resultado.find((e) => e.property === 'duracionMin');
  return Object.keys(error?.constraints ?? {});
};

describe('CrearCitaDto — duracionMin (ADR-11 §2)', () => {
  it('debería usar el tope de dominio de 1440 minutos', () => {
    expect(DURACION_MAXIMA_MIN).toBe(1440);
  });

  it('debería aceptar exactamente 1440 minutos', async () => {
    expect(await erroresDuracion(1440)).toEqual([]);
  });

  it('debería rechazar 1441 minutos con @Max', async () => {
    expect(await erroresDuracion(1441)).toEqual(['max']);
  });

  it('debería seguir exigiendo un entero positivo', async () => {
    expect(await erroresDuracion(0)).toContain('isPositive');
    expect(await erroresDuracion(1.5)).toContain('isInt');
  });
});
