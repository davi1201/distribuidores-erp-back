import { IsNotEmpty, IsNumber, IsString, Min } from 'class-validator';

export class GeneratePixQrCodeDto {
  @IsNumber()
  @Min(0.01, { message: 'O valor mínimo é R$ 0,01' })
  amount: number;

  @IsString()
  @IsNotEmpty({ message: 'O ID do cliente é obrigatório' })
  customerId: string;
}
