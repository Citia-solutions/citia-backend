import * as bcrypt from 'bcrypt';

import { TransactionRunner } from '../../../shared/application/transaction-runner';
import { validarContrasenaNueva } from '../domain/contrasena';
import { EmisorSesion } from '../domain/emisor-sesion';
import { ContrasenaActualIncorrectaError } from '../domain/exceptions/contrasena-actual-incorrecta.error';
import { ContrasenaCambiadaEnParaleloError } from '../domain/exceptions/contrasena-cambiada-en-paralelo.error';
import { ContrasenaRepetidaError } from '../domain/exceptions/contrasena-repetida.error';
import { UsuarioNoEncontradoError } from '../domain/exceptions/usuario-no-encontrado.error';
import { inicioSesionesValidas } from '../domain/sesiones';
import { IUsuarioRepository } from '../domain/usuario.repository';
import { CambiarContrasenaDto } from '../presentation/dto/cambiar-contrasena.dto';
import { ContrasenaCambiadaDto } from '../presentation/dto/contrasena-cambiada.dto';
import type { UsuarioDeSesion } from './perfil.service';

/** Costo de bcrypt: el mismo del registro (`UsuariosService`). */
const SALT_ROUNDS = 10;

/**
 * Cambio de contraseña con corte de sesiones (US-10, ADR-15 §4 y §5):
 * `PUT /api/usuarios/me/contrasena`.
 *
 * En este orden (cada error, sin escribir nada):
 *
 *  1. (formato: el DTO, antes de llegar aquí)
 *  2. el usuario existe en su organización → si no, `UsuarioNoEncontradoError` (401);
 *  3. la actual coincide con el hash → si no, `ContrasenaActualIncorrectaError`
 *     (**400, nunca 401**: el frontend cierra la sesión con cualquier 401);
 *  4. la nueva cumple la política → si no, `ContrasenaNoValidaError` (400);
 *  5. la nueva es distinta, contra el HASH → si no, `ContrasenaRepetidaError` (400);
 *  6. hash nuevo FUERA de la transacción (es CPU);
 *  7. en una transacción, `UPDATE` condicional al hash leído en 3, con el
 *     corte = el reloj truncado al segundo → si no escribió,
 *     `ContrasenaCambiadaEnParaleloError` (409);
 *  8. token nuevo con `iat` = ese corte (vale con su propio corte).
 *
 * No registra logs ni manda correo (P5): el log
 * `usuarios.contrasena_cambiada` lo escribe el controller tras el 200.
 *
 * Clase plana (ADR-02): `UsuariosModule` la arma con `useFactory`. `reloj` es
 * inyectable para las pruebas.
 */
export class CambiarContrasenaService {
  constructor(
    private readonly usuarios: IUsuarioRepository,
    private readonly tx: TransactionRunner,
    private readonly emisor: EmisorSesion,
    private readonly reloj: () => Date = () => new Date(),
  ) {}

  async cambiar(
    sesion: UsuarioDeSesion,
    dto: CambiarContrasenaDto,
  ): Promise<ContrasenaCambiadaDto> {
    const usuario = await this.usuarios.findById(
      sesion.userId,
      sesion.tenantId,
    );
    if (!usuario) {
      throw new UsuarioNoEncontradoError();
    }
    const hashAnterior = usuario.passwordHash;

    if (!(await bcrypt.compare(dto.contrasenaActual, hashAnterior))) {
      throw new ContrasenaActualIncorrectaError();
    }

    validarContrasenaNueva(dto.contrasenaNueva);

    if (await bcrypt.compare(dto.contrasenaNueva, hashAnterior)) {
      throw new ContrasenaRepetidaError();
    }

    const hashNuevo = await bcrypt.hash(dto.contrasenaNueva, SALT_ROUNDS);
    const corte = inicioSesionesValidas(this.reloj());

    await this.tx.run(async (tx) => {
      const escrito = await this.usuarios.cambiarContrasena(
        sesion.userId,
        sesion.tenantId,
        { hashAnterior, hashNuevo, sesionesValidasDesde: corte },
        tx,
      );
      if (!escrito) {
        throw new ContrasenaCambiadaEnParaleloError();
      }
    });

    return new ContrasenaCambiadaDto({
      accessToken: this.emisor.emitir(usuario, corte),
    });
  }
}
