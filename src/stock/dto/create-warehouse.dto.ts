import { IsUUID, IsNotEmpty, IsString } from 'class-validator';

export class CreateWarehouseDto {
  @IsUUID()
  @IsNotEmpty()
  userId: string; // ID do vendedor dono do carro/estoque

  @IsString()
  @IsNotEmpty()
  name: string; // Nome do depósito (ex: "João")
}
