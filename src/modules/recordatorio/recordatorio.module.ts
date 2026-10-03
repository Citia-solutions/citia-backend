import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ConfiguracionRecordatorioRepository } from './domain/configuracion-recordatorio.repository';
import { LectorCitas } from './domain/lector-citas';
import { RecordatorioRepository } from './domain/recordatorio.repository';
import { SupresionCorreoRepository } from './domain/supresion-correo.repository';
import { ConfiguracionRecordatorioOrmEntity } from './infrastructure/persistence/configuracion-recordatorio.orm-entity';
import { RecordatorioOrmEntity } from './infrastructure/persistence/recordatorio.orm-entity';
import { SqlLectorCitas } from './infrastructure/persistence/sql-lector-citas';
import { SupresionCorreoOrmEntity } from './infrastructure/persistence/supresion-correo.orm-entity';
import { TypeOrmConfiguracionRecordatorioRepository } from './infrastructure/persistence/typeorm-configuracion-recordatorio.repository';
import { TypeOrmRecordatorioRepository } from './infrastructure/persistence/typeorm-recordatorio.repository';
import { TypeOrmSupresionCorreoRepository } from './infrastructure/persistence/typeorm-supresion-correo.repository';

/**
 * Recordatorios al paciente (ADR-13).
 *
 * Paso 7 (persistencia): registra las tres tablas y los puertos con sus
 * adaptadores. Todavía SIN casos de uso, suscriptor, jobs ni rutas (pasos
 * 8–12, api-agent): cargarlo no programa nada ni escucha hechos.
 *
 * Reglas de dependencia (ADR-13 §1): NINGÚN módulo importa este; solo
 * `AppModule`. Lee `citas`, `pacientes`, `usuarios` y `tenants` por
 * `LectorCitas` (SQL de solo lectura), sin importar sus módulos. Por eso no
 * exporta nada.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      RecordatorioOrmEntity,
      ConfiguracionRecordatorioOrmEntity,
      SupresionCorreoOrmEntity,
    ]),
  ],
  providers: [
    {
      // Incluye los métodos de BARRIDO GLOBAL (ADR-12 §6): solo para los
      // jobs y el webhook, nunca para una ruta autenticada por tenant.
      provide: RecordatorioRepository,
      useClass: TypeOrmRecordatorioRepository,
    },
    {
      provide: ConfiguracionRecordatorioRepository,
      useClass: TypeOrmConfiguracionRecordatorioRepository,
    },
    {
      provide: SupresionCorreoRepository,
      useClass: TypeOrmSupresionCorreoRepository,
    },
    {
      provide: LectorCitas,
      useClass: SqlLectorCitas,
    },
  ],
})
export class RecordatorioModule {}
