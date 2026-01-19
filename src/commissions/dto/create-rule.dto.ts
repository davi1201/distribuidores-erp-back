import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateIf,
} from 'class-validator';
import { CommissionScope, CommissionType } from '@prisma/client';

export class CreateCommissionRuleDto {
  @IsString()
  name: string; // Ex: "Regra Padrão 5%"

  @IsEnum(CommissionScope)
  scope: CommissionScope;

  @IsEnum(CommissionType)
  type: CommissionType;

  // Validação Condicional: Se for PORCENTAGEM ou HÍBRIDO, exige percentage
  @ValidateIf(
    (o) =>
      o.type === CommissionType.PERCENTAGE || o.type === CommissionType.HYBRID,
  )
  @IsNumber()
  @Min(0)
  percentage?: number;

  // Validação Condicional: Se for FIXO ou HÍBRIDO, exige fixedValue
  @ValidateIf(
    (o) => o.type === CommissionType.FIXED || o.type === CommissionType.HYBRID,
  )
  @IsNumber()
  @Min(0)
  fixedValue?: number;

  // Campos opcionais baseados no escopo
  @IsOptional()
  @IsUUID()
  specificUserId?: string;

  @IsOptional()
  @IsUUID()
  specificProductId?: string;
}
