import {
  IsOptional,
  IsEnum,
  IsUUID,
  IsDateString,
  IsString,
  IsInt,
  Min,
  Max,
  IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';
import { TitleType, TitleStatus } from '../../../../core/domain/enums';

export class ListTitlesQueryDto {
  @IsOptional()
  @IsEnum(TitleType)
  type?: TitleType;

  @IsOptional()
  @IsEnum(TitleStatus)
  status?: TitleStatus;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsUUID()
  supplierId?: string;

  @IsOptional()
  @IsDateString()
  dueDateFrom?: string;

  @IsOptional()
  @IsDateString()
  dueDateTo?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @IsOptional()
  @IsIn(['dueDate', 'amount', 'createdAt'])
  orderBy?: 'dueDate' | 'amount' | 'createdAt';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  orderDirection?: 'asc' | 'desc';
}
