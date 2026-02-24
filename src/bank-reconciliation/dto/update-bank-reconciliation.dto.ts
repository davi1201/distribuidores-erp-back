import { PartialType } from '@nestjs/swagger';
import { CreateBankReconciliationDto } from './create-bank-reconciliation.dto';

export class UpdateBankReconciliationDto extends PartialType(CreateBankReconciliationDto) {}
