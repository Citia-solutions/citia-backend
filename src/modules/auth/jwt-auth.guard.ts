import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Guard reutilizable para proteger rutas con JWT Bearer.
 *
 * Uso en cualquier controller (de cualquier modulo):
 *   @UseGuards(JwtAuthGuard)
 *
 * Tras pasar el guard, `req.user` contiene un `AuthenticatedUser`.
 * Lanza 401 automaticamente si falta el token o es invalido/expirado.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
