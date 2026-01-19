import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface UserPayload {
  id: string;
  userId: string;
  // Mantendo sub como opcional caso já comece a aparecer nos tokens novos
  sub?: string;
  email: string;
  name: string;
  role: string;
  tenantId?: string | null;
}

export const CurrentUser = createParamDecorator(
  (data: keyof UserPayload | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      return null;
    }

    // PATCH: Garante que id e userId existam, vindo de 'sub' (padrão novo) ou um do outro
    if (!user.id && user.sub) {
      user.id = user.sub;
    }
    if (!user.userId && user.sub) {
      user.userId = user.sub;
    }
    // Fallback cruzado se sub não existir (garante compatibilidade id <-> userId)
    if (!user.id && user.userId) {
      user.id = user.userId;
    }
    if (!user.userId && user.id) {
      user.userId = user.id;
    }

    // Se passar um parâmetro (ex: @CurrentUser('userId')), retorna só aquele campo
    if (data) {
      return user[data];
    }

    return user;
  },
);
