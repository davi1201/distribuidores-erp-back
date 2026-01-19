import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreatePriceListDto {
  @IsString({ message: 'O nome da lista é obrigatório' })
  @IsNotEmpty()
  name: string;

  @IsString({ message: 'A descrição deve ser uma string' })
  tenantId: string;

  @IsOptional()
  percentageAdjustment?: number;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
