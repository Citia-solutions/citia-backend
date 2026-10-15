import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { TransactionRunner } from '../../shared/application/transaction-runner';
import { SharedModule } from '../../shared/shared.module';
import { CitasService } from '../cita/application/citas.service';
import { EnlacesCitaService } from '../cita/application/enlaces-cita.service';
import { CitaModule } from '../cita/cita.module';
import { SolicitudesOtraHoraService } from '../solicitud/application/solicitudes-otra-hora.service';
import { SolicitudModule } from '../solicitud/solicitud.module';
import { PortalPacienteService } from './application/portal-paciente.service';
import { LectorNombresCita } from './domain/lector-nombres-cita';
import { SqlLectorNombresCita } from './infrastructure/persistence/sql-lector-nombres-cita';
import { PortalPacienteController } from './presentation/portal-paciente.controller';

/**
 * Portal del paciente (Fase 3, ADR-10; contrato §3.4). Contexto local:
 * `CLAUDE.md` de esta carpeta.
 *
 * Módulo de COMPOSICIÓN: depende de `cita` (resolver el enlace y las acciones
 * del paciente) y de `solicitud` (pedir otra hora), y lee los nombres del
 * profesional y de la organización con su propio lector SQL. Nadie importa
 * este módulo (solo `AppModule`), y ni `cita` ni `solicitud` saben que existe.
 */
@Module({
  imports: [
    // TransactionRunner: una transacción por petición.
    SharedModule,
    // EnlacesCitaService (resolver) y CitasService (confirmar/cancelar como
    // paciente).
    CitaModule,
    // SolicitudesOtraHoraService (leer la abierta y pedir otra hora).
    SolicitudModule,
  ],
  controllers: [PortalPacienteController],
  providers: [
    {
      // Solo lectura de `usuarios` y `tenants`.
      provide: LectorNombresCita,
      useClass: SqlLectorNombresCita,
    },
    {
      // Caso de uso sin Nest (ADR-02): se arma con fábrica.
      provide: PortalPacienteService,
      useFactory: (
        transacciones: TransactionRunner,
        enlaces: EnlacesCitaService,
        citas: CitasService,
        otraHora: SolicitudesOtraHoraService,
        nombres: LectorNombresCita,
        config: ConfigService,
      ) =>
        new PortalPacienteService(
          transacciones,
          enlaces,
          citas,
          otraHora,
          nombres,
          config.get<string>('APP_TZ', 'America/Santiago'),
        ),
      inject: [
        TransactionRunner,
        EnlacesCitaService,
        CitasService,
        SolicitudesOtraHoraService,
        LectorNombresCita,
        ConfigService,
      ],
    },
  ],
})
export class PortalPacienteModule {}
