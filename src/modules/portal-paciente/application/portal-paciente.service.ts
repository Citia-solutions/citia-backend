import {
  TransactionContext,
  TransactionRunner,
} from '../../../shared/application/transaction-runner';
import { CitasService } from '../../cita/application/citas.service';
import { EnlaceCitaNoValidoError } from '../../cita/application/enlace-cita-no-valido.error';
import { EnlacesCitaService } from '../../cita/application/enlaces-cita.service';
import { Cita } from '../../cita/domain/cita.entity';
import { EnlaceCita } from '../../cita/domain/enlace-cita.entity';
import {
  PeticionOtraHora,
  SolicitudesOtraHoraService,
} from '../../solicitud/application/solicitudes-otra-hora.service';
import { SolicitudCita } from '../../solicitud/domain/solicitud-cita.entity';
import {
  AccionPaciente,
  accionesPermitidasPaciente,
} from '../domain/acciones-paciente';
import { LectorNombresCita } from '../domain/lector-nombres-cita';
import { VistaCitaPacienteDto } from '../presentation/dto/vista-cita-paciente.dto';
import { AccionNoDisponibleError } from './accion-no-disponible.error';

/**
 * Lo que cada acción conoce, ya evaluado DENTRO de su transacción: el enlace
 * y su cita (bloqueada), la petición de otra hora abierta (leída sin
 * bloquear), el instante de la evaluación y lo que el paciente puede hacer.
 */
interface ContextoAccion {
  enlace: EnlaceCita;
  cita: Cita;
  abierta: SolicitudCita | null;
  ahora: Date;
  acciones: AccionPaciente[];
}

/**
 * Portal del paciente (Fase 3, US-04 + US-02.07; contrato §3.4). Composición:
 * no tiene reglas de negocio propias más allá de `accionesPermitidasPaciente`;
 * orquesta `cita` (enlace, acciones del paciente) y `solicitud` (pedir otra
 * hora) en UNA transacción por petición.
 *
 * Esqueleto de cada petición, siempre en este orden:
 *
 *  1. `EnlacesCitaService.resolver(token, tx)`: token → enlace → cita
 *     BLOQUEADA (la cita es lo primero que se bloquea). Nunca ids del cliente.
 *  2. Validez del enlace con el reloj del portal (defensa en profundidad).
 *     Cualquier fallo de 1 o 2 → `EnlaceCitaNoValidoError` (el MISMO 404).
 *  3. La petición de otra hora abierta, SIN bloqueo.
 *  4. `accionesPermitidasPaciente`; si la acción pedida no está →
 *     `AccionNoDisponibleError` (409).
 *  5. La acción, y la vista resultante.
 *
 * Al cancelar NO se descarta aquí la petición abierta: bloquearla después de
 * la cita invertiría el orden de la bandeja (solicitud → cita) y podría
 * interbloquearse con ella. La descarta `SuscriptorSolicitudes` al recibir
 * `CitaCancelada` (segundos después, DT-33).
 *
 * Nunca registra el token ni su hash.
 */
export class PortalPacienteService {
  constructor(
    private readonly transacciones: TransactionRunner,
    private readonly enlaces: EnlacesCitaService,
    private readonly citas: CitasService,
    private readonly otraHora: SolicitudesOtraHoraService,
    private readonly nombres: LectorNombresCita,
    // `APP_TZ`: la página muestra la hora en la zona de la clínica.
    private readonly zonaHoraria: string,
    private readonly reloj: () => Date = () => new Date(),
  ) {}

  /**
   * `GET /publico/cita`. Abrir la página no ejecuta ninguna acción (S3): no
   * cambia la cita ni su bitácora y no publica hechos. Solo anota la PRIMERA
   * apertura del enlace (US-07.01, H5), y solo con un enlace válido.
   *
   * La anotación va dentro de la transacción de siempre, DESPUÉS de `resolver`
   * (que ya bloqueó la cita) y de la validez, y ANTES de armar la vista: el
   * `UPDATE` toma la fila del enlace después de la cita, en el orden de
   * bloqueo del módulo `cita`. Un enlace no válido lanza
   * `EnlaceCitaNoValidoError` antes, así que el 404 uniforme no cambia y no
   * se escribe nada. Si el `UPDATE` falla, falla la transacción (500
   * genérico): no se esconde un fallo de la base. Solo en el GET: las
   * acciones POST siempre vienen después de un GET de la misma página.
   */
  ver(token: unknown): Promise<VistaCitaPacienteDto> {
    return this.enTransaccion(token, async (ctx, tx) => {
      await this.enlaces.registrarPrimeraApertura(ctx.enlace, ctx.ahora, tx);
      return this.vista(ctx.cita, ctx.abierta, ctx.ahora, tx);
    });
  }

  /** `POST /publico/cita/confirmar`: `pendiente → confirmada` por el paciente. */
  confirmar(token: unknown): Promise<VistaCitaPacienteDto> {
    return this.enTransaccion(token, async (ctx, tx) => {
      PortalPacienteService.exigir(ctx, 'confirmar');
      const confirmada = await this.citas.confirmarComoPaciente(
        ctx.cita,
        ctx.enlace,
        tx,
      );
      // Confirmar exige que no haya petición abierta: la vista no tiene.
      return this.vista(confirmada, null, ctx.ahora, tx);
    });
  }

  /**
   * `POST /publico/cita/cancelar`: la cita queda `cancelada` (terminal). La
   * vista sale sin acciones y sin petición de otra hora; un GET posterior ya
   * responde 404 (cita terminal).
   */
  cancelar(
    token: unknown,
    motivo: string | undefined,
  ): Promise<VistaCitaPacienteDto> {
    return this.enTransaccion(token, async (ctx, tx) => {
      PortalPacienteService.exigir(ctx, 'cancelar');
      const recortado = motivo?.trim();
      const cancelada = await this.citas.cancelarComoPaciente(
        ctx.cita,
        ctx.enlace,
        recortado === '' ? undefined : recortado,
        tx,
      );
      return this.vista(cancelada, null, ctx.ahora, tx);
    });
  }

  /**
   * `POST /publico/cita/otra-hora`: crea la petición (`SolicitudCita` de
   * `reagendamiento`) sin tocar la cita (R1). La vista queda con la petición
   * abierta y solo `cancelar` (R6).
   */
  pedirOtraHora(
    token: unknown,
    peticion: PeticionOtraHora,
  ): Promise<VistaCitaPacienteDto> {
    return this.enTransaccion(token, async (ctx, tx) => {
      PortalPacienteService.exigir(ctx, 'pedirOtraHora');
      const solicitud = await this.otraHora.pedir(
        ctx.cita,
        ctx.enlace,
        peticion,
        tx,
      );
      return this.vista(ctx.cita, solicitud, ctx.ahora, tx);
    });
  }

  // ---------------------------------------------------------------------
  // Internos
  // ---------------------------------------------------------------------

  private enTransaccion<T>(
    token: unknown,
    trabajo: (ctx: ContextoAccion, tx: TransactionContext) => Promise<T>,
  ): Promise<T> {
    return this.transacciones.run(async (tx) => {
      const resuelto = await this.enlaces.resolver(token, tx);
      const ahora = this.reloj();
      if (
        !resuelto ||
        !resuelto.enlace.permiteActuarSobre(resuelto.cita, ahora)
      ) {
        // Ausente, mal formado, inexistente, revocado, cita terminal o ya
        // pasado el inicio: no se distinguen.
        throw new EnlaceCitaNoValidoError();
      }

      const abierta = await this.otraHora.abierta(resuelto.cita, tx);

      return trabajo(
        {
          enlace: resuelto.enlace,
          cita: resuelto.cita,
          abierta,
          ahora,
          acciones: accionesPermitidasPaciente(
            resuelto.cita,
            abierta !== null,
            ahora,
          ),
        },
        tx,
      );
    });
  }

  private static exigir(ctx: ContextoAccion, accion: AccionPaciente): void {
    if (!ctx.acciones.includes(accion)) {
      throw new AccionNoDisponibleError();
    }
  }

  /**
   * Proyección para el paciente (S2). Las acciones se recalculan sobre la
   * cita RESULTANTE (tras cancelar no queda ninguna).
   */
  private async vista(
    cita: Cita,
    abierta: SolicitudCita | null,
    ahora: Date,
    tx: TransactionContext,
  ): Promise<VistaCitaPacienteDto> {
    const nombres = await this.nombres.leer(cita.usuarioId, cita.tenantId, tx);
    if (!nombres) {
      // Invariante rota: la cita apunta a un usuario de su tenant (FK). Solo
      // ids en el mensaje; el cliente recibe un 500 genérico.
      throw new Error(
        `Integridad: el profesional "${cita.usuarioId}" de la cita "${cita.id}" no existe en su tenant`,
      );
    }

    return new VistaCitaPacienteDto({
      inicio: cita.inicio.toISOString(),
      zonaHoraria: this.zonaHoraria,
      duracionMin: cita.duracionMin,
      estado: cita.estado,
      profesional: nombres.profesional,
      organizacion: nombres.organizacion,
      accionesPermitidas: accionesPermitidasPaciente(
        cita,
        abierta !== null,
        ahora,
      ),
      solicitudOtraHora: abierta
        ? {
            preferencia: abierta.preferenciaHoraria,
            solicitadaEn: abierta.recibidaEn.toISOString(),
          }
        : null,
    });
  }
}
