import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { TenantOrmEntity } from '../src/modules/tenant/infrastructure/persistence/tenant.orm-entity';
import { UsuarioOrmEntity } from '../src/modules/usuario/infrastructure/persistence/usuario.orm-entity';
import { EventoSalidaOrmEntity } from '../src/shared/infrastructure/salida/evento-salida.orm-entity';

export const typeOrmTestConfig: TypeOrmModuleOptions = {
  type: 'postgres',
  host: process.env.TEST_DB_HOST ?? 'localhost',
  port: parseInt(process.env.TEST_DB_PORT ?? '5432'),
  username: process.env.TEST_DB_USER ?? 'postgres',
  password: process.env.TEST_DB_PASS ?? 'postgres',
  database: process.env.TEST_DB_NAME ?? 'citia_test',
  // EventoSalidaOrmEntity: SharedModule (que importan usuario, cita y
  // solicitud) publica en el outbox `eventos_salida` (ADR-12 §2).
  entities: [TenantOrmEntity, UsuarioOrmEntity, EventoSalidaOrmEntity],
  synchronize: true, // SOLO aquí: BD efímera de test, nunca dev/prod
  dropSchema: true, // Limpia el schema en cada run de test
};
