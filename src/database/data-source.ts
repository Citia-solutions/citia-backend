import { DataSource } from 'typeorm';

import { TenantOrmEntity } from '../modules/tenant/infrastructure/persistence/tenant.orm-entity';
import { UsuarioOrmEntity } from '../modules/usuario/infrastructure/persistence/usuario.orm-entity';

// Detecta si este archivo corre como TypeScript (ts-node, dev) o como
// JavaScript compilado (dist/, prod). Asi el mismo data-source sirve para
// `migration:run` en dev (src/**/*.ts) y en la imagen de produccion
// (dist/**/*.js), sin necesidad de ts-node ni de la carpeta src/ en prod.
const isCompiled = __filename.endsWith('.js');
const migrationsGlob = isCompiled
  ? 'dist/database/migrations/*.js'
  : 'src/database/migrations/*.ts';

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: parseInt(process.env.DB_PORT ?? '5432'),
  username: process.env.DB_USER ?? 'postgres',
  password: process.env.DB_PASS ?? 'postgres',
  database: process.env.DB_NAME ?? 'citia_dev',
  entities: [TenantOrmEntity, UsuarioOrmEntity],
  migrations: [migrationsGlob],
  synchronize: false,
});
