import { TitleStatus, TitleType } from '@prisma/client';
import { Prisma } from '@prisma/client';

export interface InstallmentRule {
  days: number;
  percent?: number;
  fixedAmount?: number;
}

export interface GenerateTitlesConfig {
  tenantId: string;
  userId: string;
  type: TitleType;
  totalAmount: number;
  docNumber: string;
  descriptionPrefix: string;
  customerId?: string;
  supplierId?: string;
  orderId?: string;
  orderPaymentId?: string;
  importId?: string;
  paymentTermId?: string;
  installmentsPlan?: InstallmentRule[];
  installmentCount?: number;
  startDate?: Date | string;
  tenantPaymentMethodId?: string;
  categoryId?: string;
  status?: TitleStatus;
  tx?: Prisma.TransactionClient;
}
