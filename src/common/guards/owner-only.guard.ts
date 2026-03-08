import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { OWNER_ONLY_KEY } from '../decorators/owner-only.decorator';
import { ForbiddenException } from '../exceptions/domain.exception';
import { AuthenticatedUser } from '../interfaces/authenticated-user.interface';
import { Role } from '@prisma/client';

/**
 * Guard that ensures only the resource owner (or admin) can access.
 * Use @OwnerOnly('paramName') decorator to enable.
 */
@Injectable()
export class OwnerOnlyGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const userIdParam = this.reflector.getAllAndOverride<string>(
      OWNER_ONLY_KEY,
      [context.getHandler(), context.getClass()],
    );

    // If @OwnerOnly() decorator is not present, allow access
    if (!userIdParam) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user as AuthenticatedUser;

    if (!user) {
      throw new ForbiddenException('Usuário não autenticado');
    }

    // Admin can access any resource
    if (user.role === Role.ADMIN) {
      return true;
    }

    const resourceOwnerId = request.params[userIdParam];

    if (!resourceOwnerId) {
      // If the param doesn't exist, we can't validate ownership
      return true;
    }

    if (user.id !== resourceOwnerId) {
      throw new ForbiddenException(
        'Você não tem permissão para acessar este recurso',
      );
    }

    return true;
  }
}
