import { esRutValido, normalizarRut } from '../../../shared/domain/rut';
import { RutInvalidoError } from '../../../shared/domain/rut-invalido.error';
import { ITenantRepository } from '../../tenant/domain/tenant.repository';
import { SolicitudCita } from '../domain/solicitud-cita.entity';
import { SolicitudCitaRepository } from '../domain/solicitud-cita.repository';
import { CrearSolicitudDto } from '../presentation/dto/crear-solicitud.dto';

export class SolicitudesService {
  constructor(
    private readonly solicitudRepository: SolicitudCitaRepository,
    private readonly tenantRepository: ITenantRepository,
    // Ventana de la regla "una solicitud abierta a la vez", en horas.
    private readonly ventanaHoras: number,
  ) {}

  /**
   * Recibe una solicitud desde el enlace público (ADR-09 §1, §8).
   *
   * Devuelve `void` a propósito: quien llama responde SIEMPRE lo mismo. Que la
   * solicitud se haya guardado o se haya descartado en silencio no debe ser
   * observable desde fuera, porque revelarlo permitiría sondear organizaciones
   * y pacientes.
   *
   * Lo único que sí se rechaza visiblemente es un RUT mal formado: eso habla
   * del dato que el propio usuario escribió, no de qué existe en el sistema.
   */
  async recibir(tenantSlug: string, dto: CrearSolicitudDto): Promise<void> {
    if (!esRutValido(dto.rut)) {
      throw new RutInvalidoError(dto.rut);
    }
    const rut = normalizarRut(dto.rut);

    // Organización inexistente: se descarta en silencio. Un 404 aquí
    // permitiría enumerar clientes probando slugs.
    const tenant = await this.tenantRepository.findBySlug(tenantSlug);
    if (!tenant) return;

    // Una solicitud abierta a la vez, acotada a una ventana de tiempo. Con la
    // ventana, una bandeja desatendida deja de bloquear al paciente sin que
    // nadie tenga que hacer nada (ver DT-28).
    const desde = new Date(Date.now() - this.ventanaHoras * 60 * 60 * 1000);
    const abierta = await this.solicitudRepository.buscarAbiertaPorRut(
      rut,
      tenant.id,
      desde,
    );
    if (abierta) return;

    await this.solicitudRepository.guardar(
      SolicitudCita.recibir({
        tenantId: tenant.id,
        rut,
        nombrePaciente: dto.nombrePaciente.trim(),
        telefono: dto.telefono.trim(),
        correo: dto.correo.trim(),
        motivo: dto.motivo.trim(),
        preferenciaHoraria: dto.preferenciaHoraria.trim(),
        consentimiento: dto.consentimiento,
      }),
    );
  }
}
