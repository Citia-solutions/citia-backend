import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { TransactionRunner } from '../../shared/application/transaction-runner';
import { SharedModule } from '../../shared/shared.module';
import { CitasService } from '../cita/application/citas.service';
import { EnlacesCitaService } from '../cita/application/enlaces-cita.service';
import { CitaModule } from '../cita/cita.module';
import { PacientesService } from '../paciente/application/pacientes.service';
import { PacienteModule } from '../paciente/paciente.module';
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
 * del paciente), de `solicitud` (pedir otra hora) y de `paciente` (la
 * aceptación de los términos, US-11), y lee los nombres del profesional y de
 * la organización con su propio lector SQL. Nadie importa este módulo (solo
 * `AppModule`), y ni `cita`, ni `solicitud`, ni `paciente` saben que existe.
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
    // PacientesService (US-11): `terminosPendientes` y aceptar los términos.
    // `paciente` no importa ninguno de los módulos de arriba: sin ciclo.
    PacienteModule,
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
        pacientes: PacientesService,
        config: ConfigService,
      ) =>
        new PortalPacienteService(
          transacciones,
          enlaces,
          citas,
          otraHora,
          nombres,
          pacientes,
          config.get<string>('APP_TZ', 'America/Santiago'),
        ),
      inject: [
        TransactionRunner,
        EnlacesCitaService,
        CitasService,
        SolicitudesOtraHoraService,
        LectorNombresCita,
        PacientesService,
        ConfigService,
      ],
    },
  ],
})
export class PortalPacienteModule {}
