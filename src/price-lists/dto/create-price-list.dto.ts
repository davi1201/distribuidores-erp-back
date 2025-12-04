import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreatePriceListDto {
  @IsString({ message: 'O nome da lista é obrigatório' })
  @IsNotEmpty()
  name: string;

  @IsOptional()
  percentageAdjustment?: number;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
