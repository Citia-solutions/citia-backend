import { normalizarCorreo } from '../../../shared/domain/correo';
import { CambioContactoVacioError } from './exceptions/cambio-contacto-vacio.error';
import { CorreoPacienteRequeridoError } from './exceptions/correo-paciente-requerido.error';

// Datos de un paciente NUEVO. `rut` llega ya canonico (o null: el alta manual
// admite personas sin RUT). `correo` se tipa laxo a proposito: la fabrica es
// la barrera que lo exige, no el tipo.
export interface CrearPacienteProps {
  rut: string | null;
  nombre: string;
  telefono: string;
  correo?: string | null;
  consentimiento: boolean;
  tenantId: string;
}

// Fila ya persistida. `correo` admite NULL: los pacientes dados de alta antes
// de la Fase 2 pueden no tenerlo (ADR-13, opcion F4). Solo lo usa el adaptador
// de persistencia.
export interface ReconstituirPacienteProps {
  id: string;
  rut: string | null;
  nombre: string;
  telefono: string;
  correo: string | null;
  consentimiento: boolean;
  tenantId: string;
}

// Cambio de contacto (`PATCH /pacientes/:id`): solo viajan los campos que se
// cambian. Ninguno se puede borrar.
export interface CambioContactoPaciente {
  telefono?: string;
  correo?: string;
}

/**
 * Paciente de un tenant. Sigue siendo una clase de datos: las reglas son
 * funciones estaticas, para que los dobles de test y los mapeos de
 * persistencia puedan seguir usando objetos planos con la misma forma.
 */
export class Paciente {
  id: string;
  // RUT en forma canonica (ver shared/domain/rut.ts). Opcional: el alta manual
  // admite personas sin RUT; el formulario publico lo exige (ADR-09 §3).
  rut?: string | null;
  nombre: string;
  telefono: string;
  // Obligatorio al crear (ADR-13 §14), pero NULL en filas viejas (opcion F4):
  // quien lo lea para escribir al paciente debe contemplar que falte.
  correo?: string | null;
  consentimiento: boolean;
  tenantId: string;

  private constructor() {
    // Se construye via crear() o reconstituir().
  }

  /**
   * Fabrica de un paciente nuevo. Exige el correo (ADR-13 §14) y lo guarda
   * normalizado (sin espacios alrededor, en minusculas). El id lo asigna la
   * persistencia.
   *
   * @throws CorreoPacienteRequeridoError si el correo falta o esta en blanco.
   */
  static crear(props: CrearPacienteProps): Paciente {
    const paciente = new Paciente();
    paciente.rut = props.rut;
    paciente.nombre = props.nombre;
    paciente.telefono = props.telefono;
    paciente.correo = Paciente.exigirCorreo(props.correo);
    paciente.consentimiento = props.consentimiento;
    paciente.tenantId = props.tenantId;
    return paciente;
  }

  /**
   * Reconstitucion desde persistencia: NO exige el correo, porque las filas
   * existentes pueden tenerlo en NULL. Uso exclusivo del repositorio.
   */
  static reconstituir(props: ReconstituirPacienteProps): Paciente {
    const paciente = new Paciente();
    paciente.id = props.id;
    paciente.rut = props.rut;
    paciente.nombre = props.nombre;
    paciente.telefono = props.telefono;
    paciente.correo = props.correo;
    paciente.consentimiento = props.consentimiento;
    paciente.tenantId = props.tenantId;
    return paciente;
  }

  /** `true` si el paciente tiene un correo no vacío (null o en blanco = no). */
  static tieneCorreo(paciente: Pick<Paciente, 'correo'>): boolean {
    return (paciente.correo ?? '').trim() !== '';
  }

  /**
   * Correo con el que se completa un paciente EXISTENTE al vincularlo por RUT
   * (ADR-13 §14, matiza ADR-09 §3): el que llega, normalizado, SOLO si el
   * guardado está vacío. Si ya tiene uno, igual o distinto, devuelve `null`:
   * un correo guardado nunca se reemplaza por esta vía.
   *
   * También `null` si no llega correo: no hay nada con qué completar.
   */
  static correoParaCompletar(
    existente: Pick<Paciente, 'correo'>,
    entrante: string | null | undefined,
  ): string | null {
    if (Paciente.tieneCorreo(existente)) return null;
    const normalizado = normalizarCorreo(entrante ?? '');
    return normalizado === '' ? null : normalizado;
  }

  /**
   * Valida y normaliza un cambio de contacto. Devuelve solo los campos
   * presentes; el correo, normalizado.
   *
   * @throws CambioContactoVacioError si no trae ningún campo.
   * @throws CorreoPacienteRequeridoError si trae `correo` en blanco: el
   *         correo se puede cambiar, pero no borrar.
   */
  static prepararCambioContacto(
    cambio: CambioContactoPaciente,
  ): CambioContactoPaciente {
    const preparado: CambioContactoPaciente = {};
    if (cambio.telefono !== undefined) preparado.telefono = cambio.telefono;
    if (cambio.correo !== undefined) {
      preparado.correo = Paciente.exigirCorreo(cambio.correo);
    }
    if (preparado.telefono === undefined && preparado.correo === undefined) {
      throw new CambioContactoVacioError();
    }
    return preparado;
  }

  private static exigirCorreo(correo: string | null | undefined): string {
    const normalizado = normalizarCorreo(correo ?? '');
    if (normalizado === '') {
      throw new CorreoPacienteRequeridoError();
    }
    return normalizado;
  }
}
