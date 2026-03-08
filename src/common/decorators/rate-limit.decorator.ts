import { SetMetadata } from '@nestjs/common';

export const RATE_LIMIT_KEY = 'rate_limit';

export interface RateLimitOptions {
  ttl: number; // Time to live in seconds
  limit: number; // Maximum number of requests
}

/**
 * Decorator to apply custom rate limiting to specific endpoints.
 * Overrides the default throttler configuration.
 *
 * @param options - Rate limit configuration
 *
 * @example
 * @RateLimit({ ttl: 60, limit: 10 }) // 10 requests per minute
 * @Post('send-email')
 * sendEmail() { ... }
 */
export const RateLimit = (options: RateLimitOptions) =>
  SetMetadata(RATE_LIMIT_KEY, options);

/**
 * Skip rate limiting for specific endpoints.
 */
export const SkipRateLimit = () => SetMetadata(RATE_LIMIT_KEY, { skip: true });
