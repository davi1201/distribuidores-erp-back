import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CalculatePriceDto {
  @IsNumber()
  @Min(0)
  costPrice: number;

  @IsNumber()
  @Min(0)
  expenses: number;

  @IsNumber()
  @Min(0)
  markup: number;

  @IsString()
  @IsOptional()
  taxProfileId?: string;

  @IsString()
  @IsOptional()
  destinationState?: string; // Para simulação
}
