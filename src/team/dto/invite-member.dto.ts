// dto/invite-member.dto.ts
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsNumber,
  IsString,
  IsNotEmpty,
  ValidateIf,
} from 'class-validator';
import { Role } from '@prisma/client';

export class InviteMemberDto {
  @IsNotEmpty()
  @IsString()
  name: string; // Agora o Admin manda o nome

  @IsEmail()
  email: string;

  @IsEnum(Role)
  role: Role;

  // --- Campos Condicionais para SELLER ---

  @ValidateIf((o) => o.role === Role.SELLER)
  @IsString()
  @IsOptional()
  whatsapp?: string;

  @ValidateIf((o) => o.role === Role.SELLER)
  @IsNumber()
  @IsOptional()
  commissionRate?: number;

  @ValidateIf((o) => o.role === Role.SELLER)
  @IsNumber()
  @IsOptional()
  maxDiscount?: number;
}
