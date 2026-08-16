// setupFile de Jest para e2e: carga las variables de .env (TEST_DB_*, JWT_*)
// ANTES de que se importen los módulos de test. Es necesario porque
// typeorm-test.config.ts lee process.env en tiempo de import, mucho antes de
// que ConfigModule.forRoot() cargue el .env dentro del beforeAll.
import { config } from 'dotenv';

config();
