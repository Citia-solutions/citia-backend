import { Module, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { PublicadorEventos } from '../../shared/application/publicador-eventos';
import { TransactionRunner } from '../../shared/application/transaction-runner';
import { RegistroSuscriptores } from '../../shared/infrastructure/salida/registro-suscriptores';
import { SharedModule } from '../../shared/shared.module';
import { CitasService } from '../cita/application/citas.service';
import { CitaModule } from '../cita/cita.module';
import { PacienteRepository } from '../paciente/domain/paciente.repository';
import { PacienteModule } from '../paciente/paciente.module';
import { ITenantRepository } from '../tenant/domain/tenant.repository';
import { TenantModule } from '../tenant/tenant.module';
import { BandejaSolicitudesService } from './application/bandeja-solicitudes.service';
import { SolicitudesOtraHoraService } from './application/solicitudes-otra-hora.service';
import { SolicitudesService } from './application/solicitudes.service';
import { SuscriptorSolicitudes } from './application/suscriptor-solicitudes';
import { SolicitudCitaRepository } from './domain/solicitud-cita.repository';
import { SolicitudCitaOrmEntity } from './infrastructure/persistence/solicitud-cita.orm-entity';
import { TypeOrmSolicitudCitaRepository } from './infrastructure/persistence/typeorm-solicitud-cita.repository';
import { SolicitudesPublicasController } from './presentation/solicitudes-publicas.controller';
import { SolicitudesController } from './presentation/solicitudes.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([SolicitudCitaOrmEntity]),
    // Para resolver la organización por su slug público.
    TenantModule,
    // Bandeja: aceptar crea la cita con `CitasService.agendar` o mueve la de
    // origen con `reagendarEnTx`; listar lee las citas de origen con
    // `resumenesPorIds`. Dependencia solicitud -> cita, nunca al revés
    // (CitaModule no importa este módulo).
    CitaModule,
    // Pedir otra hora (Fase 3): copia los datos del paciente desde su ficha
    // (`PacienteRepository`, solo lectura).
    PacienteModule,
    // Transacción (aceptar/rechazar con FOR UPDATE), hechos de dominio y el
    // registro de suscriptores del outbox.
    SharedModule,
  ],
  controllers: [SolicitudesPublicasController, SolicitudesController],
  providers: [
    {
      // Ruta ANÓNIMA: solo repositorio de solicitudes y tenants. A propósito
      // NO recibe CitasService ni TransactionRunner.
      provide: SolicitudesService,
      useFactory: (
        sr: SolicitudCitaRepository,
        tr: ITenantRepository,
        config: ConfigService,
      ) =>
        new SolicitudesService(
          sr,
          tr,
          // Ventana de la regla "una solicitud abierta a la vez". Selección por
          // configuración, mismo patrón que APP_TZ (ADR-07).
          config.get<number>('SOLICITUD_VENTANA_HORAS', 72),
        ),
      inject: [SolicitudCitaRepository, ITenantRepository, ConfigService],
    },
    {
      // Ruta AUTENTICADA (bandeja del profesional).
      provide: BandejaSolicitudesService,
      useFactory: (
        sr: SolicitudCitaRepository,
        cs: CitasService,
        tx: TransactionRunner,
        eventos: PublicadorEventos,
      ) => new BandejaSolicitudesService(sr, cs, tx, eventos),
      inject: [
        SolicitudCitaRepository,
        CitasService,
        TransactionRunner,
        PublicadorEventos,
      ],
    },
    {
      // Pedir otra hora (Fase 3). Lo usa el portal del paciente DENTRO de su
      // transacción; no abre transacciones propias.
      provide: SolicitudesOtraHoraService,
      useFactory: (
        sr: SolicitudCitaRepository,
        pr: PacienteRepository,
        eventos: PublicadorEventos,
      ) => new SolicitudesOtraHoraService(sr, pr, eventos),
      inject: [SolicitudCitaRepository, PacienteRepository, PublicadorEventos],
    },
    {
      // Outbox (ADR-12 §4): descarta / atiende la petición de otra hora
      // cuando la cita de origen termina o el profesional la reagenda.
      provide: SuscriptorSolicitudes,
      useFactory: (sr: SolicitudCitaRepository) =>
        new SuscriptorSolicitudes(sr),
      inject: [SolicitudCitaRepository],
    },
    {
      provide: SolicitudCitaRepository,
      useClass: TypeOrmSolicitudCitaRepository,
    },
  ],
  // `SolicitudesOtraHoraService`: para `portal-paciente` (Fase 3). El
  // repositorio se sigue exportando por compatibilidad.
  exports: [SolicitudCitaRepository, SolicitudesOtraHoraService],
})
export class SolicitudModule implements OnModuleInit {
  constructor(
    private readonly registro: RegistroSuscriptores,
    private readonly suscriptor: SuscriptorSolicitudes,
  ) {}

  /** Antes de `onApplicationBootstrap`: el primer tick del despachador ya lo ve. */
  onModuleInit(): void {
    this.registro.registrar(this.suscriptor);
  }
}
