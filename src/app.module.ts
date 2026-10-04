import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config'; //Realiza la lectura de variables de entorno
import { TypeOrmModule } from '@nestjs/typeorm'; //Integra el orm para conexion con la base de datos

import { AuthModule } from './modules/auth/auth.module';
import { CitaModule } from './modules/cita/cita.module';
import { PacienteModule } from './modules/paciente/paciente.module';
import { SolicitudModule } from './modules/solicitud/solicitud.module';
import { TenantModule } from './modules/tenant/tenant.module';
import { UsuariosModule } from './modules/usuario/usuarios.module';

@Module({
  imports: [
    //Carga las variables de entorno
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    //Configura la confi con postgresql de manera asincrona
    //forRootAsync pq depende de ConfigService
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule], //De donde viene la dependencia
      inject: [ConfigService], //Hacia donde se inyectta
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.getOrThrow<string>('DB_HOST'),
        port: configService.getOrThrow<number>('DB_PORT'),
        username: configService.getOrThrow<string>('DB_USER'),
        password: configService.getOrThrow<string>('DB_PASS'),
        database: configService.getOrThrow<string>('DB_NAME'),
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
  ],
})
export class AppModule {}
