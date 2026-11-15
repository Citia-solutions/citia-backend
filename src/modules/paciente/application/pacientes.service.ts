import {
  esRutValido,
  formatearRut,
  normalizarRut,
} from '../../../shared/domain/rut';
import { RutInvalidoError } from '../../../shared/domain/rut-invalido.error';
import {
  TransactionContext,
  TransactionRunner,
} from '../../../shared/application/transaction-runner';
import {
  AceptacionTerminos,
  CanalAceptacion,
  RegistrarAceptacionProps,
} from '../domain/aceptacion-terminos.entity';
import { AceptacionTerminosRepository } from '../domain/aceptacion-terminos.repository';
import { CambioContactoPaciente, Paciente } from '../domain/paciente.entity';
import { PacienteRepository } from '../domain/paciente.repository';
import { versionesQueCubren } from '../domain/terminos-paciente';
import { CrearPacienteDto } from '../presentation/dto/crear-paciente.dto';
import { PacienteResponseDto } from '../presentation/dto/paciente-response.dto';
import { PacienteNoEncontradoError } from './paciente-no-encontrado.error';

/** Quién da de alta: el usuario del token (nunca del body). */
export interface UsuarioAlta {
  userId: string;
  tenantId: string;
}

export class PacientesService {
  constructor(
    private readonly pacienteRepository: PacienteRepository,
    // US-11 (ADR-16 §3): la prueba de la aceptación de los términos. Solo
    // inserción.
    private readonly aceptaciones: AceptacionTerminosRepository,
    // `POST /pacientes` registra el paciente y su aceptación juntos.
    private readonly tx: TransactionRunner,
    // `aceptadaEn` de la aceptación del profesional (el acto es ahora).
    private readonly reloj: () => Date = () => new Date(),
  ) {}

  /**
   * `POST /pacientes` (alta manual, US-11 D6): en UNA transacción,
   * resolver-o-crear el paciente y registrar la aceptación de los términos
   * con canal `profesional`, a nombre del usuario del token, con la versión
   * del DTO y `aceptadaEn` = el reloj del servicio. Paciente existente por
   * RUT: se registra igual (una vez por versión, D11) y su bandera queda en
   * `true`. La respuesta sale con `consentimiento: true`.
   *
   * El tenant y el usuario salen SIEMPRE del token, nunca del body.
   *
   * @throws VersionTerminosNoVigenteError si la versión no recibe
   *   aceptaciones (el DTO ya lo impide; defensa).
   */
  async crearPaciente(
    dto: CrearPacienteDto,
    usuario: UsuarioAlta,
  ): Promise<PacienteResponseDto> {
    return this.tx.run(async (tx) => {
      const paciente = await this.resolverOCrear(dto, usuario.tenantId, tx);
      await this.registrarAceptacion(
        {
          canal: CanalAceptacion.PROFESIONAL,
          usuarioId: usuario.userId,
          tenantId: usuario.tenantId,
          pacienteId: paciente.id,
          // Obligatoria en HTTP (DTO). Ausente, `registrar` lanza
          // VersionTerminosNoVigenteError (→ 400).
          version: dto.terminosVersion ?? '',
          aceptadaEn: this.reloj(),
        },
        tx,
      );
      return PacientesService.aResponse({ ...paciente, consentimiento: true });
    });
  }

  /**
   * ÚNICA puerta de entrada a `aceptaciones_terminos` (US-11, ADR-16 T3):
   * arma la aceptación (`AceptacionTerminos.registrar`, que valida la versión
   * según el canal), la inserta si no hay ya una del mismo paciente, versión y
   * canal (D11) y SIEMPRE marca `pacientes.consentimiento = true` (la
   * escritura es condicional: no-op si ya estaba). Devuelve si insertó.
   *
   * `tx` OBLIGATORIO: corre siempre dentro de la transacción de quien llama
   * (alta manual, bandeja, portal), junto con lo que provocó la aceptación.
   * Bloquea la fila del paciente (el `UPDATE` de la bandera) AL FINAL del
   * flujo de quien llama: ver el orden de bloqueo en el `CLAUDE.md` del
   * módulo.
   *
   * @throws VersionTerminosNoVigenteError si la versión no sirve al canal.
   */
  async registrarAceptacion(
    props: RegistrarAceptacionProps,
    tx: TransactionContext,
  ): Promise<boolean> {
    const aceptacion = AceptacionTerminos.registrar(props);
    const insertada = await this.aceptaciones.insertarSiNoExiste(
      aceptacion,
      tx,
    );
    await this.pacienteRepository.marcarConsentimiento(
      props.pacienteId,
      props.tenantId,
      tx,
    );
    return insertada;
  }

  /**
   * ¿El TITULAR (formulario o enlace, no el profesional) aceptó una versión
   * que sigue cubriendo? Lo usa `/cita` para `terminosPendientes`. Lectura
   * sin bloqueo; filtra por tenant.
   */
  titularAceptoVigente(
    pacienteId: string,
    tenantId: string,
    tx?: TransactionContext,
  ): Promise<boolean> {
    return this.aceptaciones.existeDelTitular(
      pacienteId,
      tenantId,
      versionesQueCubren(),
      tx,
    );
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
   * NO registra ninguna aceptacion de los terminos (US-11, ADR-16 T3): cada
   * via registra su canal en su propio caso de uso, con
   * `registrarAceptacion`.
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
