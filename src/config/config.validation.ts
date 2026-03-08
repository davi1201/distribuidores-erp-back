import { plainToInstance, Type } from 'class-transformer';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Min,
  validateSync,
} from 'class-validator';

enum Environment {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

/**
 * Environment variables validation schema.
 * Validates configuration at application startup.
 */
export class EnvironmentVariables {
  @IsEnum(Environment)
  @IsOptional()
  NODE_ENV: Environment = Environment.Development;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @IsOptional()
  PORT: number = 5555;

  @IsString()
  DATABASE_URL: string;

  // Clerk
  @IsString()
  @IsOptional()
  CLERK_SECRET_KEY?: string;

  @IsString()
  @IsOptional()
  CLERK_WEBHOOK_SECRET?: string;

  // JWT
  @IsString()
  @IsOptional()
  JWT_SECRET?: string;

  // Google OAuth
  @IsString()
  @IsOptional()
  GOOGLE_CLIENT_ID?: string;

  @IsString()
  @IsOptional()
  GOOGLE_CLIENT_SECRET?: string;

  @IsString()
  @IsOptional()
  GOOGLE_CALLBACK_URL?: string;

  // Asaas
  @IsString()
  @IsOptional()
  ASAAS_API_KEY?: string;

  @IsUrl()
  @IsOptional()
  ASAAS_BASE_URL?: string;

  // Storage
  @IsString()
  @IsOptional()
  GCP_PROJECT_ID?: string;

  @IsString()
  @IsOptional()
  GCP_BUCKET?: string;

  // Mail
  @IsString()
  @IsOptional()
  MAIL_HOST?: string;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  MAIL_PORT?: number;

  @IsString()
  @IsOptional()
  MAIL_USER?: string;

  @IsString()
  @IsOptional()
  MAIL_PASSWORD?: string;

  // Redis
  @IsString()
  @IsOptional()
  REDIS_HOST?: string;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  REDIS_PORT?: number;

  // URLs
  @IsUrl()
  @IsOptional()
  FRONTEND_URL?: string;

  @IsUrl()
  @IsOptional()
  BACKEND_URL?: string;

  // Rate Limiting
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @IsOptional()
  RATE_LIMIT_TTL?: number;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @IsOptional()
  RATE_LIMIT_MAX?: number;
}

/**
 * Validates environment variables at startup.
 * Throws an error with details if validation fails.
 */
export function validate(config: Record<string, unknown>) {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    const errorMessages = errors
      .map((error) => {
        const constraints = error.constraints
          ? Object.values(error.constraints).join(', ')
          : 'unknown error';
        return `${error.property}: ${constraints}`;
      })
      .join('\n');

    throw new Error(`Environment validation failed:\n${errorMessages}`);
  }

  return validatedConfig;
}
