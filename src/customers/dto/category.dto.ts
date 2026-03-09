import { IsBoolean, IsNotEmpty, IsString } from 'class-validator';

export class CategoryDto {
  @IsString()
  @IsNotEmpty({ message: 'A descrição da categoria é obrigatória' })
  description: string;

  @IsBoolean()
  isActive: boolean;
}
