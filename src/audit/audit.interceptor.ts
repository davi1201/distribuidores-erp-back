import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AuditService } from './audit.service';
import { AUDIT_KEY, AuditOptions } from './decorators/audit.decorator';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly auditService: AuditService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const auditOptions = this.reflector.get<AuditOptions>(
      AUDIT_KEY,
      context.getHandler(),
    );
    if (!auditOptions) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const ip = request.ip || request.connection.remoteAddress;
    const userAgent = request.headers['user-agent'];
    const method = request.method;

    return next.handle().pipe(
      tap(async (responseBody) => {
        try {
          const entityId = responseBody?.id ? String(responseBody.id) : null;
          const details = {
            method,
            url: request.url,
            requestBody: request.body,
            responseSummary: entityId ? `ID: ${entityId}` : 'Success',
          };

          if (details.requestBody?.password)
            delete details.requestBody.password;

          await this.auditService.log({
            action: auditOptions.action,
            entity: auditOptions.resource,
            entityId: entityId ?? undefined,
            userId: user?.userId || 'system',
            ipAddress: ip,
            details: details,
          });
        } catch (error) {
          this.logger.error(
            `Falha ao gravar log de auditoria: ${error.message}`,
          );
        }
      }),
    );
  }
}
