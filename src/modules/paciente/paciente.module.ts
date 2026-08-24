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
  // Se exporta el puerto (para resolver nombres en el dashboard) y el servicio
  // (para que Cita reutilice `resolverOCrear` al agendar, ADR-09 §3).
  exports: [PacienteRepository, PacientesService],
})
export class PacienteModule {}
