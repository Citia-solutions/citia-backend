import { Injectable, Module, Type } from '@nestjs/common';
import { Test } from '@nestjs/testing';

/**
 * El contenedor de inyección de `AppModule` se arma completo, SIN base de
 * datos (US-10: `FirmaJwtModule` dentro de `UsuariosModule`, `SoporteModule`,
 * `SoportePlanificacionModule`, `SuscripcionController` en `TenantModule`…).
 *
 * Modo `preview` de Nest: resuelve TODO el grafo de dependencias (un token
 * que nadie provee o exporta falla igual que al arrancar) pero no instancia
 * nada, así que la fábrica de TypeORM no se llama y no hace falta Postgres.
 * Lo que este test NO cubre (instanciar, conectar, `onModuleInit`) lo cubren
 * las e2e con `AppModule` (`test/planificador.e2e-spec.ts`).
 *
 * `AppModule` se importa DESPUÉS de fijar el entorno: su `ConfigModule.forRoot`
 * valida al evaluarse el decorador `@Module`, es decir, al importar el archivo.
 */
describe('AppModule (contenedor de DI, sin base)', () => {
  const entornoOriginal = { ...process.env };

  beforeAll(() => {
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-unit';
    process.env.PLANIFICADOR_ACTIVO = 'false';
    process.env.LIMITE_TASA_ACTIVO = 'false';
  });

  afterAll(() => {
    process.env = entornoOriginal;
  });

  it('debería resolver todas las dependencias de AppModule cuando se compila en modo preview', async () => {
    // Arrange — recién ahora se evalúa `app.module.ts` (y su ConfigModule)
    const { AppModule } = jest.requireActual<{ AppModule: Type<unknown> }>(
      './app.module',
    );

    // Act
    const compilar = Test.createTestingModule({ imports: [AppModule] }).compile(
      { preview: true },
    );

    // Assert
    await expect(compilar).resolves.toBeDefined();
  });

  it('debería fallar en modo preview cuando falta un proveedor (control: el test anterior no pasa en falso)', async () => {
    // Arrange — un servicio que pide un token que nadie provee
    abstract class PuertoSinProveedor {}
    @Injectable()
    class ServicioHuerfano {
      constructor(readonly puerto: PuertoSinProveedor) {}
    }
    @Module({ providers: [ServicioHuerfano] })
    class ModuloRoto {}

    // Act
    const compilar = Test.createTestingModule({
      imports: [ModuloRoto],
    }).compile({ preview: true });

    // Assert
    await expect(compilar).rejects.toThrow(/PuertoSinProveedor/);
  });
});
