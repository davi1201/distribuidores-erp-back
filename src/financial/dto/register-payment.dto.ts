import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export enum PaymentType {
  TOTAL = 'TOTAL', // Paga tudo
  PARTIAL = 'PARTIAL', // Paga uma parte
}

export class RegisterPaymentDto {
  @IsString()
  @IsNotEmpty()
  titleId: string;

  @IsNumber()
  @Min(0.01)
  amount: number; // Quanto está pagando

  @IsDateString()
  @IsOptional()
  paymentDate?: string; // Data do pagamento (pode ser retroativo)

  @IsNumber()
  @IsOptional()
  interest?: number; // Juros/Multa cobrados (adiciona ao valor pago)

  @IsNumber()
  @IsOptional()
  discount?: number; // Desconto concedido (abate do valor devido)

  @IsString()
  @IsOptional()
  observation?: string;
}
