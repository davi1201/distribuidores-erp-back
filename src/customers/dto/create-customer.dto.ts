import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
  ValidateIf,
} from 'class-validator';

export enum PersonType {
  PF = 'PF',
  PJ = 'PJ',
}

class CreateContactDto {
  @IsString() @IsOptional() name?: string;
  @IsString() @IsOptional() phone?: string;
  @IsString() @IsOptional() role?: string;
}

class CreateAddressDto {
  @IsString() @IsOptional() zipCode?: string;
  @IsString() @IsOptional() street?: string;
  @IsString() @IsOptional() number?: string;
  @IsString() @IsOptional() complement?: string;
  @IsString() @IsOptional() neighborhood?: string;
  @IsNumber() @IsOptional() city?: number;
  @IsNumber() @IsOptional() state?: number;
  @IsString() @IsOptional() ibgeCode?: string;
  @IsString() @IsOptional() categoryId?: string; // ID da categoria criada previamente
}

class CreateAttachmentDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  url: string;
}

export class CreateCustomerDto {
  @IsString() @IsNotEmpty() name: string;

  @IsEmail() @IsOptional() email?: string;

  @IsString() @IsOptional() phone?: string;

  @IsEnum(PersonType) personType: PersonType;

  @IsString() @IsOptional() document?: string; // CPF ou CNPJ

  // --- Regra Condicional PJ ---
  @ValidateIf((o) => o.personType === 'PJ')
  @IsString()
  @IsOptional()
  corporateName?: string;

  @ValidateIf((o) => o.personType === 'PJ')
  @IsString()
  @IsOptional()
  tradeName?: string;

  // IE é obrigatória se não for isento
  @ValidateIf((o) => o.personType === 'PJ' && !o.isExempt)
  @IsString()
  @IsOptional()
  stateRegistration?: string;

  @IsBoolean() @IsOptional() isExempt?: boolean;
  @IsString() @IsOptional() municipalRegistration?: string;

  // --- Fiscais ---
  @IsBoolean() @IsOptional() isFinalConsumer?: boolean;
  @IsBoolean() @IsOptional() isICMSContributor?: boolean;
  @IsString() @IsOptional() invoiceNotes?: string;

  // --- Financeiro ---
  @IsNumber() @IsOptional() creditLimit?: number;
  @IsBoolean() @IsOptional() allowExceedLimit?: boolean;
  @IsString() @IsOptional() sellerId?: string;
  @IsString() @IsOptional() categoryId?: string;

  // --- Nested Writes (Cria junto) ---
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => CreateContactDto)
  contacts?: CreateContactDto[];

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => CreateAddressDto)
  addresses?: CreateAddressDto[];

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => CreateAttachmentDto)
  attachments?: CreateAttachmentDto[];

  @IsString()
  @IsOptional()
  priceListId: string;
}
