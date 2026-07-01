import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';

import { AuthenticatedUser } from './jwt-payload.interface';

/**
 * Extrae el `AuthenticatedUser` que la JwtStrategy dejo en `req.user`.
 *
 * Uso (siempre detras de `@UseGuards(JwtAuthGuard)`):
 *   async handler(@CurrentUser() user: AuthenticatedUser) { ... }
 *
 * De aqui salen tenantId/userId; NUNCA del body de la request.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const request = ctx.switchToHttp().getRequest<Request>();
    return request.user as AuthenticatedUser;
  },
);
