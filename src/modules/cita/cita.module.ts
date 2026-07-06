import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { PacienteModule } from '../paciente/paciente.module';
import { PacienteRepository } from '../paciente/domain/paciente.repository';
import { CitasService } from './application/citas.service';
import { CitaRepository } from './domain/cita.repository';
import { CitaOrmEntity } from './infrastructure/persistence/cita.orm-entity';
import { TypeOrmCitaRepository } from './infrastructure/persistence/typeorm-cita.repository';
import { CitasController } from './presentation/citas.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([CitaOrmEntity]),
    // Importa PacienteModule para inyectar PacienteRepository (resolver nombres
    // y validar que el paciente pertenece al tenant).
    PacienteModule,
  ],
  controllers: [CitasController],
  providers: [
    {
      provide: CitasService,
      useFactory: (
        cr: CitaRepository,
        pr: PacienteRepository,
        config: ConfigService,
      ) =>
        new CitasService(
          cr,
          pr,
          config.get<string>('APP_TZ', 'America/Santiago'),
        ),
      inject: [CitaRepository, PacienteRepository, ConfigService],
    },
    {
      provide: CitaRepository,
      useClass: TypeOrmCitaRepository,
    },
  ],
})
export class CitaModule {}
