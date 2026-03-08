import { Module, Global } from '@nestjs/common';
import { TenantGuard } from './guards/tenant.guard';
import { OwnerOnlyGuard } from './guards/owner-only.guard';

/**
 * Common module providing shared guards, filters, decorators, and utilities.
 * Made global so these utilities are available throughout the application.
 */
@Global()
@Module({
  providers: [TenantGuard, OwnerOnlyGuard],
  exports: [TenantGuard, OwnerOnlyGuard],
})
export class CommonModule {}
