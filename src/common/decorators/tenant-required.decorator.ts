import { SetMetadata } from '@nestjs/common';

export const TENANT_REQUIRED_KEY = 'tenant_required';

/**
 * Decorator to mark endpoints that require the user to have a tenant.
 * Use with TenantGuard.
 *
 * @example
 * @TenantRequired()
 * @Get('dashboard')
 * getDashboard() { ... }
 */
export const TenantRequired = () => SetMetadata(TENANT_REQUIRED_KEY, true);
