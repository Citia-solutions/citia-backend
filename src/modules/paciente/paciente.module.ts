import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { PacientesService } from './application/pacientes.service';
import { PacienteRepository } from './domain/paciente.repository';
import { PacienteOrmEntity } from './infrastructure/persistence/paciente.orm-entity';
import { TypeOrmPacienteRepository } from './infrastructure/persistence/typeorm-paciente.repository';
import { PacientesController } from './presentation/pacientes.controller';

@Module({
  imports: [TypeOrmModule.forFeature([PacienteOrmEntity])],
  controllers: [PacientesController],
  providers: [
    {
      provide: PacientesService,
      useFactory: (pr: PacienteRepository) => new PacientesService(pr),
      inject: [PacienteRepository],
    },
    {
      provide: PacienteRepository,
      useClass: TypeOrmPacienteRepository,
    },
  ],
  // Se exporta el puerto para que el modulo Cita resuelva nombres de paciente.
  exports: [PacienteRepository],
})
export class PacienteModule {}
