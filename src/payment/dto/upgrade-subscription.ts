import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UpgradeSubscriptionDto {
  @IsString()
  @IsNotEmpty()
  planSlug: string;

  @IsString()
  @IsNotEmpty()
  cardToken: string;

  @IsEnum(['monthly', 'yearly'])
  @IsOptional()
  cycle?: 'monthly' | 'yearly';
}
