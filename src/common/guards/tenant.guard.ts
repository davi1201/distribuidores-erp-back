import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { TENANT_REQUIRED_KEY } from '../decorators/tenant-required.decorator';
import { ForbiddenException } from '../exceptions/domain.exception';
import { AuthenticatedUser } from '../interfaces/authenticated-user.interface';

/**
 * Guard that ensures the user has an associated tenant.
 * Use @TenantRequired() decorator to enable.
 */
@Injectable()
export class TenantGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiresTenant = this.reflector.getAllAndOverride<boolean>(
      TENANT_REQUIRED_KEY,
      [context.getHandler(), context.getClass()],
    );

    // If @TenantRequired() decorator is not present, allow access
    if (!requiresTenant) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user as AuthenticatedUser;

    if (!user) {
      throw new ForbiddenException('Usuário não autenticado');
    }

    if (!user.tenantId) {
      throw new ForbiddenException(
        'Você precisa estar vinculado a uma empresa para acessar este recurso',
      );
    }

    return true;
  }
}
