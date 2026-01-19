import {
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class RegisterPaymentDto {
  [x: string]: any;
  @IsString()
  @IsNotEmpty()
  titleId: string;

  @IsNumber()
  @Min(0.01)
  amount: number; // Valor sendo baixado

  @IsString()
  @IsNotEmpty()
  bankAccountId: string; // OBRIGATÓRIO PARA CONCILIAÇÃO

  @IsDateString()
  @IsOptional()
  paymentDate?: string; // Data da baixa

  @IsNumber()
  @IsOptional()
  interest?: number; // Juros (+)

  @IsNumber()
  @IsOptional()
  discount?: number; // Desconto (-)

  @IsString()
  @IsOptional()
  observation?: string;
}
