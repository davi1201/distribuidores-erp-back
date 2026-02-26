import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsBoolean,
} from 'class-validator';

export class CreateBankAccountDto {
  @IsString()
  @IsNotEmpty({ message: 'O nome da conta é obrigatório' })
  name: string;

  @IsString()
  @IsOptional()
  agency?: string;

  @IsString()
  @IsOptional()
  account?: string; // 💡 Padronizado para bater com o Prisma schema

  @IsNumber()
  @IsOptional()
  initialBalance?: number;

  // 👇 Novos campos adicionados
  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;

  @IsString()
  @IsOptional()
  pixKey?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class UpdateBankAccountDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  agency?: string;

  @IsString()
  @IsOptional()
  account?: string;

  @IsNumber()
  @IsOptional()
  initialBalance?: number;

  // 👇 Novos campos adicionados
  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;

  @IsString()
  @IsOptional()
  pixKey?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
