import {
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class CreateSupplierDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  corporateName?: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(11)
  document: string; // CNPJ/CPF limpo

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  // Endereço
  @IsString() @IsOptional() zipCode?: string;
  @IsString() @IsOptional() street?: string;
  @IsString() @IsOptional() number?: string;
  @IsString() @IsOptional() complement?: string;
  @IsString() @IsOptional() neighborhood?: string;
  @IsString() @IsOptional() city?: string;
  @IsString() @IsOptional() state?: string;
  @IsString() @IsOptional() ibgeCode?: string;
}

export class LinkProductSupplierDto {
  @IsString()
  @IsNotEmpty()
  productId: string;

  @IsString()
  @IsNotEmpty()
  supplierId: string;

  @IsString()
  @IsOptional()
  supplierProductCode?: string;

  @IsNumber()
  @IsOptional()
  lastPrice?: number;

  @IsBoolean()
  @IsOptional()
  isMain?: boolean;
}
