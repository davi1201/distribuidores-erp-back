import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { Role } from '@prisma/client';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    // Se a rota não exige permissão específica, passa
    if (!requiredPermissions) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest();

    // --- MUDANÇA AQUI: Admin agora tem acesso total ---
    // Owner, Super Admin e Admin do Tenant têm "God Mode"
    if (
      user.role === Role.OWNER ||
      user.role === Role.SUPER_ADMIN ||
      user.role === Role.ADMIN
    ) {
      return true;
    }

    // Para Seller e Support, verifica se tem a permissão específica
    return requiredPermissions.every((permission) =>
      user.permissions?.includes(permission),
    );
  }
}
