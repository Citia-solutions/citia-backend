import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { SharedModule } from '../../shared/shared.module';
import { PublicadorEventos } from '../../shared/application/publicador-eventos';
import { TransactionRunner } from '../../shared/application/transaction-runner';
import { PacientesService } from '../paciente/application/pacientes.service';
import { PacienteModule } from '../paciente/paciente.module';
import { PacienteRepository } from '../paciente/domain/paciente.repository';
import { CitasService } from './application/citas.service';
import { CambioCitaRepository } from './domain/cambio-cita.repository';
import { CitaRepository } from './domain/cita.repository';
import { CambioCitaOrmEntity } from './infrastructure/persistence/cambio-cita.orm-entity';
import { CitaOrmEntity } from './infrastructure/persistence/cita.orm-entity';
import { TypeOrmCambioCitaRepository } from './infrastructure/persistence/typeorm-cambio-cita.repository';
import { TypeOrmCitaRepository } from './infrastructure/persistence/typeorm-cita.repository';
import { CitasController } from './presentation/citas.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([CitaOrmEntity, CambioCitaOrmEntity]),
    // Importa PacienteModule para inyectar PacienteRepository (resolver nombres
    // y validar que el paciente pertenece al tenant) y PacientesService
    // (resolver-o-crear por RUT al agendar).
    PacienteModule,
    // TransactionRunner: agendar escribe en dos tablas y debe ser atomico.
    SharedModule,
  ],
  controllers: [CitasController],
  providers: [
    {
      provide: CitasService,
      useFactory: (
        cr: CitaRepository,
        ccr: CambioCitaRepository,
        pr: PacienteRepository,
        ps: PacientesService,
        tx: TransactionRunner,
        eventos: PublicadorEventos,
        config: ConfigService,
      ) =>
        new CitasService(
          cr,
          ccr,
          pr,
          ps,
          tx,
          eventos,
          config.get<string>('APP_TZ', 'America/Santiago'),
        ),
      inject: [
        CitaRepository,
        CambioCitaRepository,
        PacienteRepository,
        PacientesService,
        TransactionRunner,
        PublicadorEventos,
        ConfigService,
      ],
    },
    {
      provide: CitaRepository,
      useClass: TypeOrmCitaRepository,
    },
    {
      provide: CambioCitaRepository,
      useClass: TypeOrmCambioCitaRepository,
    },
  ],
})
export class CitaModule {}
