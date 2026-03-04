import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsIn,
  IsNumber,
  IsOptional,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CardDataDto {
  @ApiProperty({ example: 'DAVI SILVA' })
  @IsString()
  @IsNotEmpty()
  holderName: string;

  @ApiProperty({ example: '0000000000000000' })
  @IsString()
  @IsNotEmpty()
  number: string;

  @ApiProperty({ example: '12' })
  @IsString()
  @IsNotEmpty()
  expiryMonth: string;

  @ApiProperty({ example: '2029' })
  @IsString()
  @IsNotEmpty()
  expiryYear: string;

  @ApiProperty({ example: '123' })
  @IsString()
  @IsNotEmpty()
  ccv: string;

  @ApiProperty({ example: 'davi@email.com' })
  @IsString()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ example: '12345678900' })
  @IsString()
  @IsNotEmpty()
  cpfCnpj: string;

  @ApiProperty({ example: '01001000' })
  @IsString()
  @IsNotEmpty()
  postalCode: string;

  @ApiProperty({ example: '123' })
  @IsString()
  @IsNotEmpty()
  addressNumber: string;

  @ApiProperty({ example: '11999999999' })
  @IsString()
  @IsNotEmpty()
  phone: string;
}

export class AsaasCheckoutDto {
  @ApiProperty({ example: 'uuid-do-plano-pro' })
  @IsString()
  @IsNotEmpty()
  planId: string;

  @ApiProperty({ enum: ['MONTHLY', 'YEARLY'] })
  @IsIn(['MONTHLY', 'YEARLY'])
  cycle: 'MONTHLY' | 'YEARLY';

  @ApiProperty({ example: 12, required: false })
  @IsNumber()
  @IsOptional()
  installments?: number;

  @ApiProperty({ type: CardDataDto })
  @ValidateNested()
  @Type(() => CardDataDto)
  cardData: CardDataDto;
}
