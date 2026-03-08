import { TransactionType, Prisma } from '@prisma/client';

export interface CreateBankAccountDto {
  name: string;
  agency?: string;
  accountNumber?: string;
  initialBalance?: number;
}

export interface UpdateBankAccountDto extends Partial<CreateBankAccountDto> {
  isActive?: boolean;
}

export interface BankTransactionData {
  id: string;
  type: TransactionType | 'CREDIT' | 'DEBIT';
  amount: Prisma.Decimal | number | string;
  date: Date | string;
  description: string;
}

export interface ParsedBankTransaction {
  fitId: string;
  type: 'CREDIT' | 'DEBIT';
  amount: number;
  date: Date;
  description: string;
}
