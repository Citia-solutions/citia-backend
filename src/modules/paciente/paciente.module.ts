import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { TransactionRunner } from '../../shared/application/transaction-runner';
import { SharedModule } from '../../shared/shared.module';
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
    // TransactionRunner (US-11): `POST /pacientes` registra el paciente y su
    // aceptación de los términos en una transacción. SharedModule no importa
    // ningún módulo de negocio: sin ciclo.
    SharedModule,
  ],
  controllers: [PacientesController],
  providers: [
    {
      // Caso de uso sin Nest (ADR-02): se arma con fábrica. El reloj es el
      // por defecto (`aceptadaEn` del canal `profesional`).
      provide: PacientesService,
      useFactory: (
        pr: PacienteRepository,
        aceptaciones: AceptacionTerminosRepository,
        tx: TransactionRunner,
      ) => new PacientesService(pr, aceptaciones, tx),
      inject: [
        PacienteRepository,
        AceptacionTerminosRepository,
        TransactionRunner,
      ],
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
  // (para que Cita reutilice `resolverOCrear` al agendar, ADR-09 §3, y para
  // que `cita`, `solicitud` y `portal-paciente` registren la aceptación de
  // los términos con `registrarAceptacion`, US-11). El puerto de
  // `aceptaciones_terminos` NO se exporta: solo se escribe por el servicio.
  // Este módulo no importa ninguno de los que lo importan (sin ciclos).
  exports: [PacienteRepository, PacientesService],
})
export class PacienteModule {}
