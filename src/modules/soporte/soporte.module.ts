import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { TransactionRunner } from '../../shared/application/transaction-runner';
import type { Entorno } from '../../shared/infrastructure/config/entorno';
import { SharedModule } from '../../shared/shared.module';
// Por archivo, SIN importar `RecordatorioModule` (ADR-15 opción F2, DT-59):
// el puerto del canal y su fábrica (`registro` o `resend`).
import { CanalMensajeria } from '../recordatorio/domain/canal-mensajeria';
import { crearCanalMensajeria } from '../recordatorio/infrastructure/mensajeria/crear-canal-mensajeria';
import { ITenantRepository } from '../tenant/domain/tenant.repository';
import { TenantModule } from '../tenant/tenant.module';
import { IUsuarioRepository } from '../usuario/domain/usuario.repository';
import { UsuariosModule } from '../usuario/usuarios.module';
import { EnviarMensajesSoporteService } from './application/enviar-mensajes-soporte.service';
import { RegistrarMensajeSoporteService } from './application/registrar-mensaje-soporte.service';
import { MensajeSoporteRepository } from './domain/mensaje-soporte.repository';
import { MensajeSoporteOrmEntity } from './infrastructure/persistence/mensaje-soporte.orm-entity';
import { TypeOrmMensajeSoporteRepository } from './infrastructure/persistence/typeorm-mensaje-soporte.repository';
import { SoporteController } from './presentation/soporte.controller';

/**
 * Mensajes a soporte (US-10, P7; ADR-15 §7). Contexto local: `CLAUDE.md` de
 * esta carpeta.
 *
 * - `POST /api/soporte/mensajes` guarda la fila `pendiente` (tope de 5 por
 *   organización en 24 h) y no envía nada.
 * - `EnviarMensajesSoporteService` la envía por correo; lo invoca SOLO el job
 *   `soporte.envio`, que vive en `SoportePlanificacionModule` (lo importa solo
 *   `AppModule`): así este módulo se carga en una e2e sin `ScheduleModule`.
 * - El correo sale por `CanalMensajeria`, con su propia instancia armada por
 *   `crearCanalMensajeria` (las mismas variables que los recordatorios:
 *   `MENSAJERIA_ADAPTADOR`, `RESEND_API_KEY`, `CORREO_REMITENTE`). Se usa el
 *   código de `recordatorio` POR ARCHIVO, sin importar su módulo (DT-59).
 *
 * Lee usuarios y organizaciones por sus puertos (`UsuariosModule`,
 * `TenantModule`). Necesita `ConfigModule` (global) y la `DataSource` de
 * TypeORM. Nadie importa este módulo salvo `AppModule` y su hermano de
 * planificación.
 */
@Module({
  imports: [
    // Registra `mensajes_soporte` para `autoLoadEntities`.
    TypeOrmModule.forFeature([MensajeSoporteOrmEntity]),
    // TransactionRunner.
    SharedModule,
    // IUsuarioRepository (findById) e ITenantRepository (findById).
    UsuariosModule,
    TenantModule,
  ],
  controllers: [SoporteController],
  providers: [
    {
      // Incluye los métodos de BARRIDO GLOBAL (ADR-12 §6): reclamar y
      // bloquear por id. Solo los usa el envío (el job), nunca la ruta.
      provide: MensajeSoporteRepository,
      useClass: TypeOrmMensajeSoporteRepository,
    },
    {
      // Instancia propia del canal (no se exporta): mismo adaptador y
      // remitente que los recordatorios. Su log de arranque dice
      // "Recordatorios: …" (cosmético, DT-59); el contexto lo distingue.
      provide: CanalMensajeria,
      useFactory: (config: ConfigService<Entorno, true>) =>
        crearCanalMensajeria(
          {
            adaptador: config.get('MENSAJERIA_ADAPTADOR', { infer: true }),
            apiKey: config.get('RESEND_API_KEY', { infer: true }),
            remitente: config.get('CORREO_REMITENTE', { infer: true }),
            produccion:
              config.get('NODE_ENV', { infer: true }) === 'production',
          },
          new Logger('CanalMensajeriaSoporte'),
        ),
      inject: [ConfigService],
    },
    {
      // Casos de uso sin Nest (ADR-02): se arman con fábrica.
      provide: RegistrarMensajeSoporteService,
      useFactory: (
        transacciones: TransactionRunner,
        mensajes: MensajeSoporteRepository,
      ) => new RegistrarMensajeSoporteService(transacciones, mensajes),
      inject: [TransactionRunner, MensajeSoporteRepository],
    },
    {
      // BARRIDO GLOBAL (ADR-12 §6): solo lo invoca el planificador.
      provide: EnviarMensajesSoporteService,
      useFactory: (
        transacciones: TransactionRunner,
        mensajes: MensajeSoporteRepository,
        usuarios: IUsuarioRepository,
        tenants: ITenantRepository,
        canal: CanalMensajeria,
        config: ConfigService<Entorno, true>,
      ) =>
        new EnviarMensajesSoporteService(
          transacciones,
          mensajes,
          usuarios,
          tenants,
          canal,
          {
            // Opcional (T10): sin ella el job no se registra y, si se invoca
            // a mano, no reclama nada.
            destino:
              config.get('SOPORTE_CORREO_DESTINO', { infer: true }) ?? '',
            tz: config.get('APP_TZ', { infer: true }),
          },
        ),
      inject: [
        TransactionRunner,
        MensajeSoporteRepository,
        IUsuarioRepository,
        ITenantRepository,
        CanalMensajeria,
        ConfigService,
      ],
    },
  ],
  // Para `SoportePlanificacionModule`; nadie más lo necesita.
  exports: [EnviarMensajesSoporteService],
})
export class SoporteModule {}
