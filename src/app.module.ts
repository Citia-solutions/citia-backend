import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config'; //Realiza la lectura de variables de entorno
import { TypeOrmModule } from '@nestjs/typeorm'; //Integra el orm para conexion con la base de datos

import { AuthModule } from './modules/auth/auth.module';
import { CitaModule } from './modules/cita/cita.module';
import { PacienteModule } from './modules/paciente/paciente.module';
import { RecordatorioModule } from './modules/recordatorio/recordatorio.module';
import { SolicitudModule } from './modules/solicitud/solicitud.module';
import { TenantModule } from './modules/tenant/tenant.module';
import { UsuariosModule } from './modules/usuario/usuarios.module';
import {
  Entorno,
  validarEntorno,
} from './shared/infrastructure/config/entorno';
import { ObservabilidadModule } from './shared/observabilidad.module';
import { PlanificacionModule } from './shared/planificacion.module';

@Module({
  imports: [
    //Carga las variables de entorno y las VALIDA al arrancar: si falta o esta
    //mal alguna, la app no arranca y lista todos los errores juntos.
    //Tipos y defaults en shared/infrastructure/config/entorno.ts.
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validarEntorno,
    }),
    //Logs JSON (pino) con id por peticion y redaccion, GET /api/health y
    //latidos de los jobs (ADR-13 §16). Global: se importa solo aqui.
    ObservabilidadModule,
    //Configura la confi con postgresql de manera asincrona
    //forRootAsync pq depende de ConfigService
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule], //De donde viene la dependencia
      inject: [ConfigService], //Hacia donde se inyectta
      useFactory: (config: ConfigService<Entorno, true>) => ({
        type: 'postgres',
        host: config.get('DB_HOST', { infer: true }),
        port: config.get('DB_PORT', { infer: true }),
        username: config.get('DB_USER', { infer: true }),
        password: config.get('DB_PASS', { infer: true }),
        database: config.get('DB_NAME', { infer: true }),
        synchronize: false,
        autoLoadEntities: true,
      }),
    }),
    AuthModule, //Modulo de autentificacion
    TenantModule, //Modulo de los tenant
    UsuariosModule, //Modulos de los usuarios
    PacienteModule, //Modulo de pacientes
    CitaModule, //Modulo de citas (dashboard US-06)
    SolicitudModule, //Solicitudes de hora del paciente (via publica, US-02)
    //Recordatorios (ADR-13). Por ahora solo tablas y puertos: sin jobs,
    //suscriptor ni rutas. Ningun otro modulo lo importa (ADR-13 §1).
    RecordatorioModule,
    //Planificador en proceso (ADR-12 §5): despachador del outbox y purga.
    //Solo aqui, para que las e2e parciales no levanten jobs. Con
    //PLANIFICADOR_ACTIVO=false (default en tests) no programa nada.
    PlanificacionModule,
  ],
})
export class AppModule {}
