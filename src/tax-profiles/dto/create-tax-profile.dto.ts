import { Type } from 'class-transformer';
import {
  IsArray,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class CreateTaxRuleDto {
  @IsString()
  @IsOptional()
  id?: string; // Opcional para identificar updates

  @IsString()
  @IsNotEmpty()
  originState: string;

  @IsString()
  @IsNotEmpty()
  destinationState: string;

  @IsNumber()
  @Min(0)
  icmsRate: number;

  @IsNumber()
  @Min(0)
  ipiRate: number;

  @IsNumber()
  @Min(0)
  pisRate: number;

  @IsNumber()
  @Min(0)
  cofinsRate: number;
}

export class CreateTaxProfileDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateTaxRuleDto)
  @IsOptional()
  rules?: CreateTaxRuleDto[];
}
