import { IsArray, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreatePayoutDto {
  @IsUUID()
  sellerId: string;

  @IsArray()
  @IsUUID('4', { each: true })
  commissionIds: string[]; // Lista dos IDs das comissões que estão sendo pagas

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  receiptUrl?: string;
}
