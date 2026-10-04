// Entorno para las e2e que arrancan el `AppModule` COMPLETO.
//
// Se importa por su efecto y ANTES que `AppModule`: el `ConfigModule.forRoot`
// de `AppModule` valida el entorno cuando se evalúa el decorador `@Module`, es
// decir, al importar `src/app.module.ts`, no al compilar el módulo de test.
//
// `process.env` gana sobre el `.env` en `ConfigModule`, así que esto redirige
// la conexión a la base de test (TEST_DB_*) en lugar de la de desarrollo.

process.env.NODE_ENV = 'test';
// Lo que usan las e2e (ADR-12 §5). Explícito: un `.env` local con `true` no
// debe cambiar el resultado.
process.env.PLANIFICADOR_ACTIVO = 'false';
process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'test-secret-e2e';

process.env.DB_HOST = process.env.TEST_DB_HOST ?? 'localhost';
process.env.DB_PORT = process.env.TEST_DB_PORT ?? '5432';
process.env.DB_USER = process.env.TEST_DB_USER ?? 'postgres';
process.env.DB_PASS = process.env.TEST_DB_PASS ?? 'postgres';
process.env.DB_NAME = process.env.TEST_DB_NAME ?? 'citia_test';

export {};
