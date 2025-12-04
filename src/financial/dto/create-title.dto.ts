import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export enum PaymentMethodEnum {
  WALLET = 'WALLET',
  CREDIT_CARD = 'CREDIT_CARD',
  PIX = 'PIX',
  CASH = 'CASH',
  BOLETO = 'BOLETO',
}

export class CreateTitleDto {
  @IsString()
  @IsNotEmpty()
  titleNumber: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsNotEmpty()
  customerId: string;

  @IsString()
  @IsOptional()
  orderId?: string;

  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsDateString()
  dueDate: string; // ISO Date

  @IsEnum(PaymentMethodEnum)
  @IsOptional()
  paymentMethod?: string;
}
