import { DataSource } from 'typeorm';

import { TenantOrmEntity } from '../modules/tenant/infrastructure/persistence/tenant.orm-entity';
import { UsuarioOrmEntity } from '../modules/usuario/infrastructure/persistence/usuario.orm-entity';

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: parseInt(process.env.DB_PORT ?? '5432'),
  username: process.env.DB_USER ?? 'postgres',
  password: process.env.DB_PASS ?? 'postgres',
  database: process.env.DB_NAME ?? 'citia_dev',
  entities: [TenantOrmEntity, UsuarioOrmEntity],
  migrations: ['src/database/migrations/*.ts'],
  synchronize: false,
});
