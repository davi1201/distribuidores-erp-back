import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateIf,
} from 'class-validator';

export enum TransferType {
  PIX = 'PIX',
  TED = 'TED',
}

export enum PixKeyType {
  CPF = 'CPF',
  CNPJ = 'CNPJ',
  EMAIL = 'EMAIL',
  PHONE = 'PHONE',
  EVP = 'EVP', // Chave aleatória
}

export class TransferRequestDto {
  @IsNumber()
  @Min(1, { message: 'O valor mínimo para transferência é R$ 1,00' })
  value: number;

  @IsEnum(TransferType)
  @IsNotEmpty()
  type: TransferType;

  // Para PIX
  @ValidateIf((o) => o.type === TransferType.PIX)
  @IsEnum(PixKeyType)
  pixKeyType?: PixKeyType;

  @ValidateIf((o) => o.type === TransferType.PIX)
  @IsString()
  @IsNotEmpty()
  pixKey?: string;

  // Para TED
  @ValidateIf((o) => o.type === TransferType.TED)
  @IsString()
  @IsNotEmpty()
  bankCode?: string;

  @ValidateIf((o) => o.type === TransferType.TED)
  @IsString()
  @IsNotEmpty()
  agency?: string;

  @ValidateIf((o) => o.type === TransferType.TED)
  @IsString()
  @IsNotEmpty()
  account?: string;

  @ValidateIf((o) => o.type === TransferType.TED)
  @IsString()
  @IsNotEmpty()
  accountDigit?: string;

  @ValidateIf((o) => o.type === TransferType.TED)
  @IsString()
  @IsNotEmpty()
  accountType?: 'CONTA_CORRENTE' | 'CONTA_POUPANCA';

  @ValidateIf((o) => o.type === TransferType.TED)
  @IsString()
  @IsNotEmpty()
  ownerName?: string;

  @ValidateIf((o) => o.type === TransferType.TED)
  @IsString()
  @IsNotEmpty()
  ownerCpfCnpj?: string;

  @IsOptional()
  @IsString()
  description?: string;
}
