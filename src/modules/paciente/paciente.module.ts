import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { PacientesService } from './application/pacientes.service';
import { AceptacionTerminosRepository } from './domain/aceptacion-terminos.repository';
import { PacienteRepository } from './domain/paciente.repository';
import { AceptacionTerminosOrmEntity } from './infrastructure/persistence/aceptacion-terminos.orm-entity';
import { PacienteOrmEntity } from './infrastructure/persistence/paciente.orm-entity';
import { TypeOrmAceptacionTerminosRepository } from './infrastructure/persistence/typeorm-aceptacion-terminos.repository';
import { TypeOrmPacienteRepository } from './infrastructure/persistence/typeorm-paciente.repository';
import { PacientesController } from './presentation/pacientes.controller';

@Module({
  imports: [
    // AceptacionTerminosOrmEntity: registra la tabla `aceptaciones_terminos`
    // (US-11). Su adaptador escribe con SQL sobre el EntityManager del tx, no
    // la inyecta. Una suite que liste entidades a mano y cargue este modulo
    // tiene que incluirla (y a Tenant, Usuario y Paciente, por sus FK).
    TypeOrmModule.forFeature([PacienteOrmEntity, AceptacionTerminosOrmEntity]),
  ],
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
    {
      // Solo inserción (US-11, ADR-16 §3). El EntityManager por defecto es
      // para las lecturas sin `tx` (`existeDelTitular`); las escrituras
      // exigen el de la transacción.
      provide: AceptacionTerminosRepository,
      useFactory: (dataSource: DataSource) =>
        new TypeOrmAceptacionTerminosRepository(dataSource.manager),
      inject: [DataSource],
    },
  ],
  // Se exporta el puerto (para resolver nombres en el dashboard) y el servicio
  // (para que Cita reutilice `resolverOCrear` al agendar, ADR-09 §3).
  exports: [PacienteRepository, PacientesService],
})
export class PacienteModule {}
