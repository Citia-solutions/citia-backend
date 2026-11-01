import type { Provider } from '@nestjs/common';

import { VerificarSesionService } from '../../src/modules/auth/application/verificar-sesion.service';
import type { Usuario } from '../../src/modules/usuario/domain/usuario.entity';
import {
  EstadoSesionUsuario,
  IUsuarioRepository,
} from '../../src/modules/usuario/domain/usuario.repository';

/**
 * Doble de `VerificarSesionService` para las e2e SIN base que declaran
 * `JwtStrategy` como proveedor directo (`citas-detalle`, `citas-rango`,
 * `recordatorios-http`, `solicitudes-bandeja`).
 *
 * Desde US-10 (ADR-15 §5) la estrategia pregunta en cada petición si la sesión
 * sigue vigente. Esas suites firman sus tokens con usuarios inventados que no
 * existen en ninguna base: con el repositorio real recibirían 401. Aquí se usa
 * el servicio REAL con un repositorio que dice "existe y nunca cambió su
 * contraseña" (`sesiones_validas_desde` en `NULL`): toda sesión es vigente y
 * la estrategia se comporta como antes de US-10.
 *
 * El corte de sesiones se prueba en sus unitarios y en
 * `test/cambio-contrasena.e2e-spec.ts` (con base), no aquí.
 *
 * Uso: `providers: [JwtStrategy, SESION_VIGENTE_FALSA, JwtAuthGuard, …]`.
 */
export class UsuariosSinCorteDeSesion extends IUsuarioRepository {
  /** Cuántas veces preguntó la estrategia (una por petición autenticada). */
  consultas = 0;

  estadoSesion(): Promise<EstadoSesionUsuario | null> {
    this.consultas++;
    return Promise.resolve({ sesionesValidasDesde: null });
  }

  findByEmailAndTenant(): Promise<Usuario | null> {
    return noUsado('findByEmailAndTenant');
  }

  guardar(): Promise<Usuario> {
    return noUsado('guardar');
  }

  findById(): Promise<Usuario | null> {
    return noUsado('findById');
  }

  actualizarPerfil(): Promise<Usuario | null> {
    return noUsado('actualizarPerfil');
  }

  cambiarContrasena(): Promise<boolean> {
    return noUsado('cambiarContrasena');
  }
}

function noUsado(metodo: string): Promise<never> {
  return Promise.reject(
    new Error(`UsuariosSinCorteDeSesion.${metodo}: no se usa en esta suite`),
  );
}

/** Proveedor listo para `Test.createTestingModule({ providers: [...] })`. */
export const SESION_VIGENTE_FALSA: Provider = {
  provide: VerificarSesionService,
  useFactory: () => new VerificarSesionService(new UsuariosSinCorteDeSesion()),
};
