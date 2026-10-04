import { SuscriptorEventos } from '../../application/suscriptor-eventos';

/**
 * Registro en memoria de los suscriptores del outbox (ADR-12 §4).
 *
 * Desacopla a los módulos de negocio del despachador: cada módulo registra sus
 * suscriptores al iniciar y el despachador pregunta, por cada hecho, quién lo
 * escucha. Lo exporta `SharedModule`.
 *
 * ```ts
 * export class RecordatorioModule implements OnModuleInit {
 *   constructor(
 *     private readonly registro: RegistroSuscriptores,
 *     private readonly suscriptor: SuscriptorRecordatorios,
 *   ) {}
 *   onModuleInit(): void {
 *     this.registro.registrar(this.suscriptor);
 *   }
 * }
 * ```
 *
 * Los `onModuleInit` corren antes de que el planificador arranque
 * (`onApplicationBootstrap`), así que el primer tick ya ve a todos.
 *
 * Sin suscriptores para un hecho, el despachador lo marca entregado igual.
 */
export class RegistroSuscriptores {
  private readonly suscriptores: SuscriptorEventos[] = [];

  /**
   * Registra un suscriptor. Registrar dos veces la MISMA instancia no hace
   * nada (si no, cada hecho le llegaría dos veces por transacción).
   */
  registrar(suscriptor: SuscriptorEventos): void {
    if (suscriptor.eventos.length === 0) {
      throw new Error(
        `${suscriptor.constructor.name}: un suscriptor debe escuchar al menos un hecho (ADR-12 §4)`,
      );
    }
    if (!this.suscriptores.includes(suscriptor)) {
      this.suscriptores.push(suscriptor);
    }
  }

  /** Suscriptores que escuchan `nombreEvento`, en orden de registro. */
  suscriptoresDe(nombreEvento: string): readonly SuscriptorEventos[] {
    return this.suscriptores.filter((s) => s.eventos.includes(nombreEvento));
  }

  todos(): readonly SuscriptorEventos[] {
    return [...this.suscriptores];
  }
}
