import {
  EmisorSesion,
  UsuarioSesion,
} from '../../usuario/domain/emisor-sesion';
import { ITokenSigner } from '../domain/token-signer';
import { crearPayloadJwt } from '../jwt-payload.interface';

/**
 * Adaptador del puerto `EmisorSesion` de `usuario` (US-10, ADR-15 §6).
 *
 * Firma con el mismo `ITokenSigner` (y por tanto el mismo `JwtModule`,
 * `JWT_SECRET` y `JWT_EXPIRES_IN`) que el login, y arma los claims con el mismo
 * `crearPayloadJwt`: un token emitido aquí es indistinguible de uno de login,
 * salvo que su `iat` es `emitidoEn` (el corte) y no la hora de la firma.
 *
 * Clase plana: `FirmaJwtModule` la arma con `useFactory`.
 */
export class JwtEmisorSesion extends EmisorSesion {
  constructor(private readonly signer: ITokenSigner) {
    super();
  }

  emitir(usuario: UsuarioSesion, emitidoEn: Date): string {
    return this.signer.sign(crearPayloadJwt(usuario, emitidoEn));
  }
}
