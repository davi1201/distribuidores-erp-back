import { SetMetadata } from '@nestjs/common';

export const OWNER_ONLY_KEY = 'owner_only';

/**
 * Decorator to mark endpoints that only the resource owner can access.
 * Use with OwnerOnlyGuard.
 *
 * @param userIdParam - The name of the route parameter containing the user ID
 *
 * @example
 * @OwnerOnly('userId')
 * @Get(':userId/profile')
 * getProfile(@Param('userId') userId: string) { ... }
 */
export const OwnerOnly = (userIdParam = 'userId') =>
  SetMetadata(OWNER_ONLY_KEY, userIdParam);
