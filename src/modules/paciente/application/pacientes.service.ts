import {
  esRutValido,
  formatearRut,
  normalizarRut,
} from '../../../shared/domain/rut';
import { RutInvalidoError } from '../../../shared/domain/rut-invalido.error';
import { CambioContactoPaciente, Paciente } from '../domain/paciente.entity';
import { PacienteRepository } from '../domain/paciente.repository';
import { CrearPacienteDto } from '../presentation/dto/crear-paciente.dto';
import { PacienteResponseDto } from '../presentation/dto/paciente-response.dto';
import { TransactionContext } from '../../../shared/application/transaction-runner';
import { PacienteNoEncontradoError } from './paciente-no-encontrado.error';

export class PacientesService {
  constructor(private readonly pacienteRepository: PacienteRepository) {}

  // Crea un paciente asociado al tenant del usuario autenticado.
  // El tenantId proviene SIEMPRE del token, nunca del body.
  async crearPaciente(
    dto: CrearPacienteDto,
    tenantId: string,
  ): Promise<PacienteResponseDto> {
    const saved = await this.resolverOCrear(dto, tenantId);
    return PacientesService.aResponse(saved);
  }

  /**
   * Resuelve la identidad del paciente dentro del tenant (ADR-09 §3):
   * si el RUT ya existe devuelve ese paciente; si no, lo crea.
   *
   * Al vincular un paciente existente NO se toca su ficha, con una sola
   * excepcion (ADR-13 §14): si su correo esta vacio, se completa con el que
   * llega. Un correo ya guardado, igual o distinto, nunca se reemplaza.
   *
   * Es el corazon compartido por las vias de entrada: el boton "nueva cita"
   * del profesional (`POST /citas`), el alta directa (`POST /pacientes`) y la
   * aceptacion de una solicitud de la bandeja (via `CitasService.agendar`).
   * Por eso recibe `tx` opcional: quien lo llame lo envuelve en su propia
   * transaccion, y TODAS las escrituras (crear o completar) van en ella.
   *
   * @throws RutInvalidoError si el RUT no supera el digito verificador.
   * @throws CorreoPacienteRequeridoError si hay que crear y no llega correo.
   */
  async resolverOCrear(
    dto: CrearPacienteDto,
    tenantId: string,
    tx?: TransactionContext,
  ): Promise<Paciente> {
    let rutCanonico: string | null = null;

    if (dto.rut) {
      if (!esRutValido(dto.rut)) {
        throw new RutInvalidoError(dto.rut);
      }
      rutCanonico = normalizarRut(dto.rut);

      const existente = await this.pacienteRepository.buscarPorRut(
        rutCanonico,
        tenantId,
        tx,
      );
      if (existente) {
        return this.completarCorreoSiFalta(existente, dto.correo, tenantId, tx);
      }
    }

    const nuevo = Paciente.crear({
      rut: rutCanonico,
      nombre: dto.nombre,
      telefono: dto.telefono,
      correo: dto.correo,
      consentimiento: dto.consentimiento,
      tenantId,
    });
    return this.pacienteRepository.guardar(nuevo, tx);
  }

  /**
   * `PATCH /pacientes/:id`: completa o corrige `telefono` y/o `correo`
   * (ADR-13 §14, para los pacientes viejos sin correo). A diferencia de la
   * vinculacion por RUT, aqui el profesional SI puede reemplazar un correo:
   * es una edicion explicita.
   *
   * Inexistente u otro tenant -> `PacienteNoEncontradoError` (no se
   * distinguen). El cambio se valida ANTES de tocar la base.
   *
   * @throws CambioContactoVacioError si no trae ningun campo.
   * @throws CorreoPacienteRequeridoError si trae `correo` en blanco.
   * @throws PacienteNoEncontradoError si no existe en el tenant.
   */
  async actualizarContacto(
    id: string,
    cambio: CambioContactoPaciente,
    tenantId: string,
  ): Promise<PacienteResponseDto> {
    const preparado = Paciente.prepararCambioContacto(cambio);

    const escrito = await this.pacienteRepository.actualizarContacto(
      id,
      tenantId,
      preparado,
    );
    if (!escrito) {
      throw new PacienteNoEncontradoError(id);
    }

    // Se relee para responder con lo que quedo guardado, como el alta.
    const paciente = await this.pacienteRepository.buscarPorId(id, tenantId);
    if (!paciente) {
      throw new PacienteNoEncontradoError(id);
    }
    return PacientesService.aResponse(paciente);
  }

  static aResponse(paciente: Paciente): PacienteResponseDto {
    return new PacienteResponseDto({
      id: paciente.id,
      rut: paciente.rut ? formatearRut(paciente.rut) : null,
      nombre: paciente.nombre,
      telefono: paciente.telefono,
      correo: paciente.correo ?? null,
      consentimiento: paciente.consentimiento,
      tenantId: paciente.tenantId,
    });
  }

  /**
   * Completa el correo de un paciente existente solo si lo tiene vacio
   * (ADR-13 §14). La decision es del dominio; el repositorio repite la
   * condicion en el UPDATE para que una vinculacion concurrente no la pise.
   */
  private async completarCorreoSiFalta(
    existente: Paciente,
    correoEntrante: string | null | undefined,
    tenantId: string,
    tx?: TransactionContext,
  ): Promise<Paciente> {
    const correo = Paciente.correoParaCompletar(existente, correoEntrante);
    if (correo === null) return existente;

    const escrito = await this.pacienteRepository.completarCorreoSiVacio(
      existente.id,
      tenantId,
      correo,
      tx,
    );
    if (escrito) {
      existente.correo = correo;
      return existente;
    }

    // Otra transaccion lo completo primero: se devuelve lo que quedo.
    return (
      (await this.pacienteRepository.buscarPorId(existente.id, tenantId, tx)) ??
      existente
    );
  }
}
