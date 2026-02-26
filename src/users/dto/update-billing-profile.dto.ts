import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsDate,
} from 'class-validator';

export class UpdateBillingProfileDto {
  @IsEnum(['PF', 'PJ'])
  personType: 'PF' | 'PJ';

  @IsString()
  @IsNotEmpty()
  document: string; // CPF ou CNPJ

  @IsString()
  @IsNotEmpty()
  phone: string; // Com DDD

  // Endereço de Cobrança
  @IsString()
  @IsNotEmpty()
  zipCode: string;

  @IsString()
  @IsNotEmpty()
  street: string;

  @IsString()
  @IsNotEmpty()
  number: string;

  @IsOptional()
  complement?: string;

  @IsString()
  @IsNotEmpty()
  neighborhood: string;

  @IsString()
  @IsNotEmpty()
  city: string;

  @IsString()
  @IsNotEmpty()
  state: string; // UF
  ibgeCode: any;
  email: any;

  @IsDate()
  @IsNotEmpty()
  birthDate: Date;
}
