import { SetMetadata } from '@nestjs/common';

export const AUDIT_KEY = 'audit';

export interface AuditOptions {
  action: string;
  resource: string;
}

export const Audit = (action: string, resource: string) =>
  SetMetadata(AUDIT_KEY, { action, resource });
