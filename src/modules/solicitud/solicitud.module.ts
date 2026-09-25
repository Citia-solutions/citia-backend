import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ITenantRepository } from '../tenant/domain/tenant.repository';
import { TenantModule } from '../tenant/tenant.module';
import { SolicitudesService } from './application/solicitudes.service';
import { SolicitudCitaRepository } from './domain/solicitud-cita.repository';
import { SolicitudCitaOrmEntity } from './infrastructure/persistence/solicitud-cita.orm-entity';
import { TypeOrmSolicitudCitaRepository } from './infrastructure/persistence/typeorm-solicitud-cita.repository';
import { SolicitudesPublicasController } from './presentation/solicitudes-publicas.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([SolicitudCitaOrmEntity]),
    // Para resolver la organización por su slug público.
    TenantModule,
  ],
  controllers: [SolicitudesPublicasController],
  providers: [
    {
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
      provide: SolicitudCitaRepository,
      useClass: TypeOrmSolicitudCitaRepository,
    },
  ],
  exports: [SolicitudCitaRepository],
})
export class SolicitudModule {}
