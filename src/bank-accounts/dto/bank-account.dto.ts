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
  accountNumber?: string;

  @IsNumber()
  @IsOptional()
  initialBalance?: number;

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

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
