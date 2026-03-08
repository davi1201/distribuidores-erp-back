import { IsDateString, IsOptional } from 'class-validator';

export class GetTransactionsDto {
  @IsOptional()
  @IsDateString({}, { message: 'startDate deve ser uma data válida' })
  startDate?: string;

  @IsOptional()
  @IsDateString({}, { message: 'endDate deve ser uma data válida' })
  endDate?: string;
}
