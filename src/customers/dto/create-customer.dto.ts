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
  @IsString() @IsNotEmpty() name: string;
  @IsString() @IsNotEmpty() phone: string;
  @IsString() @IsOptional() role?: string;
}

class CreateAddressDto {
  @IsString() @IsNotEmpty() zipCode: string;
  @IsString() @IsNotEmpty() street: string;
  @IsString() @IsNotEmpty() number: string;
  @IsString() @IsOptional() complement?: string;
  @IsString() @IsNotEmpty() neighborhood: string;
  @IsString() @IsNotEmpty() city: string;
  @IsString() @IsNotEmpty() state: string;
  @IsString() @IsOptional() ibgeCode?: string;
  @IsString() @IsNotEmpty() categoryId: string; // ID da categoria criada previamente
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

  @IsEmail() @IsNotEmpty() email: string;

  @IsString() @IsOptional() phone?: string;

  @IsEnum(PersonType) personType: PersonType;

  @IsString() @IsNotEmpty() document: string; // CPF ou CNPJ

  // --- Regra Condicional PJ ---
  @ValidateIf((o) => o.personType === 'PJ')
  @IsString()
  @IsNotEmpty()
  corporateName?: string;

  @ValidateIf((o) => o.personType === 'PJ')
  @IsString()
  @IsNotEmpty()
  tradeName?: string;

  // IE é obrigatória se não for isento
  @ValidateIf((o) => o.personType === 'PJ' && !o.isExempt)
  @IsString()
  @IsNotEmpty()
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
