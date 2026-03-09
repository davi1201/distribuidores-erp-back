import { PartialType } from '@nestjs/swagger';
import { CreatePaymentTermDto } from './create-payment-term.dto';
import {
  IsOptional,
  IsUUID,
  IsBoolean,
  IsNumber,
  IsString,
  IsArray,
} from 'class-validator';

export class UpdatePaymentTermDto extends PartialType(CreatePaymentTermDto) {
  @IsUUID()
  @IsOptional()
  id?: string;

  @IsUUID()
  @IsOptional()
  tenantId?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsNumber()
  @IsOptional()
  installmentsCount?: number;

  // Campos de auditoria/metadados que o front envia,
  // mas o back geralmente ignora no service:
  @IsString()
  @IsOptional()
  createdAt?: string;

  @IsString()
  @IsOptional()
  updatedAt?: string;

  @IsArray()
  @IsOptional()
  allowedMethods?: any[];
}
