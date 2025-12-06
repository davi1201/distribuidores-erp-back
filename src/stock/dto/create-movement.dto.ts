import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
} from 'class-validator';

export enum MovementReason {
  PURCHASE = 'Compra',
  SALE = 'Venda',
  ADJUSTMENT = 'Ajuste de Inventário',
  LOSS = 'Perda / Quebra',
  RETURN_IN = 'Devolução de Cliente',
  RETURN_OUT = 'Devolução ao Fornecedor',
  PRODUCTION = 'Produção Interna',
}

export enum MovementType {
  ENTRY = 'ENTRY',
  EXIT = 'EXIT',
  TRANSFER = 'TRANSFER',
}

export class CreateStockMovementDto {
  @IsUUID()
  @IsNotEmpty()
  productId: string;

  @IsEnum(MovementType)
  @IsNotEmpty()
  type: MovementType;

  @IsNumber()
  @IsPositive({ message: 'A quantidade deve ser maior que zero.' })
  quantity: number;

  @IsString()
  @IsNotEmpty()
  reason: string; // Pode ser um texto livre ou um dos Enums acima + ID (ex: "Venda #100")

  @IsString()
  @IsOptional()
  documentReference?: string; // Ex: Número da NF-e
}
