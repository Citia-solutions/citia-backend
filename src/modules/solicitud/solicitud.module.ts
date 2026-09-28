import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { PublicadorEventos } from '../../shared/application/publicador-eventos';
import { TransactionRunner } from '../../shared/application/transaction-runner';
import { SharedModule } from '../../shared/shared.module';
import { CitasService } from '../cita/application/citas.service';
import { CitaModule } from '../cita/cita.module';
import { ITenantRepository } from '../tenant/domain/tenant.repository';
import { TenantModule } from '../tenant/tenant.module';
import { BandejaSolicitudesService } from './application/bandeja-solicitudes.service';
import { SolicitudesService } from './application/solicitudes.service';
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
    // Bandeja: aceptar crea la cita con `CitasService.agendar`. Dependencia
    // solicitud -> cita, nunca al revés (CitaModule no importa este módulo).
    CitaModule,
    // Bandeja: transacción (aceptar/rechazar con FOR UPDATE) y hechos de dominio.
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
      provide: SolicitudCitaRepository,
      useClass: TypeOrmSolicitudCitaRepository,
    },
  ],
  exports: [SolicitudCitaRepository],
})
export class SolicitudModule {}
