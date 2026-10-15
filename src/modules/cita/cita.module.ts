import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { SharedModule } from '../../shared/shared.module';
import { PublicadorEventos } from '../../shared/application/publicador-eventos';
import { TransactionRunner } from '../../shared/application/transaction-runner';
import type { Entorno } from '../../shared/infrastructure/config/entorno';
import { PacientesService } from '../paciente/application/pacientes.service';
import { PacienteModule } from '../paciente/paciente.module';
import { PacienteRepository } from '../paciente/domain/paciente.repository';
import { CitasService } from './application/citas.service';
import { EnlacesCitaService } from './application/enlaces-cita.service';
import { CambioCitaRepository } from './domain/cambio-cita.repository';
import { CitaRepository } from './domain/cita.repository';
import { DerivadorTokenEnlace } from './domain/derivador-token-enlace';
import { EnlaceCitaRepository } from './domain/enlace-cita.repository';
import { CambioCitaOrmEntity } from './infrastructure/persistence/cambio-cita.orm-entity';
import { CitaOrmEntity } from './infrastructure/persistence/cita.orm-entity';
import { EnlaceCitaOrmEntity } from './infrastructure/persistence/enlace-cita.orm-entity';
import { TypeOrmCambioCitaRepository } from './infrastructure/persistence/typeorm-cambio-cita.repository';
import { TypeOrmCitaRepository } from './infrastructure/persistence/typeorm-cita.repository';
import { TypeOrmEnlaceCitaRepository } from './infrastructure/persistence/typeorm-enlace-cita.repository';
import { claveEnlaceCita } from './infrastructure/seguridad/clave-enlace-cita';
import { HmacDerivadorTokenEnlace } from './infrastructure/seguridad/hmac-derivador-token-enlace';
import { CitasController } from './presentation/citas.controller';

@Module({
  imports: [
    // EnlaceCitaOrmEntity: registra la tabla `enlaces_cita` (Fase 3). Su
    // adaptador escribe con SQL sobre el EntityManager del tx, no la inyecta.
    TypeOrmModule.forFeature([
      CitaOrmEntity,
      CambioCitaOrmEntity,
      EnlaceCitaOrmEntity,
    ]),
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
    {
      // Enlace del paciente (Fase 3). Todos sus métodos exigen tx.
      provide: EnlaceCitaRepository,
      useClass: TypeOrmEnlaceCitaRepository,
    },
    {
      // HMAC-SHA256 con `ENLACE_CITA_CLAVE` (E2). La clave nunca se registra.
      provide: DerivadorTokenEnlace,
      useFactory: (config: ConfigService<Entorno, true>) =>
        new HmacDerivadorTokenEnlace(claveEnlaceCita(config)),
      inject: [ConfigService],
    },
    {
      // Caso de uso sin Nest (ADR-02): se arma con fábrica. El aviso de la
      // autocorrección por cambio de clave (DT-45) va al log con ids y
      // versiones, nunca con el token ni su hash.
      provide: EnlacesCitaService,
      useFactory: (
        enlaces: EnlaceCitaRepository,
        citas: CitaRepository,
        derivador: DerivadorTokenEnlace,
        tx: TransactionRunner,
      ) => {
        const logger = new Logger(EnlacesCitaService.name);
        return new EnlacesCitaService(
          enlaces,
          citas,
          derivador,
          tx,
          () => new Date(),
          (aviso) => {
            try {
              // Un objeto, como el resto de los logs (pino / Better Stack).
              logger.warn({
                ...aviso,
                msg: 'Enlace del paciente reemitido: ENLACE_CITA_CLAVE cambió y el enlace activo ya no correspondía (DT-45)',
              });
            } catch {
              // Un fallo del log no puede romper el envío del recordatorio.
            }
          },
        );
      },
      inject: [
        EnlaceCitaRepository,
        CitaRepository,
        DerivadorTokenEnlace,
        TransactionRunner,
      ],
    },
  ],
  // Quién puede importar este módulo (ver CLAUDE.md): `solicitud` (bandeja:
  // `agendar`, `reagendarEnTx`), `recordatorio` (`EnlacesCitaService.asegurarActivo`
  // en el envío) y `portal-paciente` (`resolver` + acciones del paciente). Este
  // módulo no importa ninguno de ellos (sin ciclo).
  exports: [CitasService, EnlacesCitaService, DerivadorTokenEnlace],
})
export class CitaModule {}
