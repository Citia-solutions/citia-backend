import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { TenantOrmEntity } from '../src/modules/tenant/infrastructure/persistence/tenant.orm-entity';
import { UsuarioOrmEntity } from '../src/modules/usuario/infrastructure/persistence/usuario.orm-entity';

export const typeOrmTestConfig: TypeOrmModuleOptions = {
  type: 'postgres',
  host: process.env.TEST_DB_HOST ?? 'localhost',
  port: parseInt(process.env.TEST_DB_PORT ?? '5432'),
  username: process.env.TEST_DB_USER ?? 'postgres',
  password: process.env.TEST_DB_PASS ?? 'postgres',
  database: process.env.TEST_DB_NAME ?? 'citia_test',
  entities: [TenantOrmEntity, UsuarioOrmEntity],
  synchronize: true, // SOLO aquí: BD efímera de test, nunca dev/prod
  dropSchema: true, // Limpia el schema en cada run de test
};
