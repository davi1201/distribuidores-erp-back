import { Role } from '@prisma/client';

/**
 * Interface representing an authenticated user from the request.
 * Used consistently across all controllers and guards.
 */
export interface AuthenticatedUser {
  id: string;
  email: string;
  role: Role;
  tenantId: string | null;
  clerkId: string;
  name?: string;
  permissions?: string[];
}

/**
 * Extended request interface with user property.
 */
export interface AuthenticatedRequest extends Request {
  user: AuthenticatedUser;
}

/**
 * Type guard to check if user is authenticated.
 */
export function isAuthenticated(user: unknown): user is AuthenticatedUser {
  return (
    user !== null &&
    typeof user === 'object' &&
    'id' in user &&
    'email' in user &&
    'role' in user
  );
}

/**
 * Type guard to check if user has tenant.
 */
export function hasTenant(
  user: AuthenticatedUser,
): user is AuthenticatedUser & { tenantId: string } {
  return user.tenantId !== null;
}
