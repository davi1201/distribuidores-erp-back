import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateIf,
} from 'class-validator';

export enum PaymentMethodEnum {
  WALLET = 'WALLET',
  CREDIT_CARD = 'CREDIT_CARD',
  PIX = 'PIX',
  CASH = 'CASH',
  BOLETO = 'BOLETO',
  BANK_TRANSFER = 'BANK_TRANSFER',
}

export enum FinancialTitleType {
  RECEIVABLE = 'RECEIVABLE',
  PAYABLE = 'PAYABLE',
}

export class CreateTitleDto {
  @IsEnum(FinancialTitleType)
  @IsNotEmpty()
  type: FinancialTitleType; // Define se é Pagar ou Receber

  @IsString()
  @IsOptional()
  titleNumber?: string; // Opcional, o sistema gera se não vier

  @IsString()
  @IsNotEmpty()
  description: string;

  // --- VINCULOS (Condicionais na lógica de negócio) ---
  @IsString()
  @IsOptional()
  customerId?: string; // Obrigatório se RECEIVABLE (validado no service)

  @IsString()
  @IsOptional()
  supplierId?: string; // Obrigatório se PAYABLE (validado no service)

  @IsString()
  @IsOptional()
  orderId?: string; // Venda

  @IsString()
  @IsOptional()
  importId?: string; // Importação

  @IsString()
  @IsOptional()
  categoryId?: string; // Plano de Contas

  // --- VALORES E DATAS ---
  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsDateString()
  dueDate: string; // ISO Date

  @IsString()
  paymentMethodId: string;
  installments: number;
}
