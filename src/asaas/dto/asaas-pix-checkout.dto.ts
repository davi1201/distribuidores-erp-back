import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsIn, IsOptional } from 'class-validator';

export class AsaasPixCheckoutDto {
  @ApiProperty({ example: 'uuid-do-plano-pro' })
  @IsString()
  @IsNotEmpty()
  planId: string;

  @ApiProperty({ enum: ['MONTHLY', 'YEARLY'] })
  @IsIn(['MONTHLY', 'YEARLY'])
  cycle: 'MONTHLY' | 'YEARLY';
}
