import { PartialType } from '@nestjs/mapped-types';
import { CreateProductDto } from './create-product.dto';
import { IsOptional, IsString } from 'class-validator';

export class UpdateProductDto extends PartialType(CreateProductDto) {
  // Motivo da alteração (Opcional, útil para auditoria de preço)
  @IsString()
  @IsOptional()
  changeReason?: string;
}
