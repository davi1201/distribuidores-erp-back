import { PaginationResult } from './base.repository';
import {
  TitleStatus,
  TitleType,
  TitleOrigin,
  MovementType,
} from '../../../domain/enums';

// ============================================================================
// ENTIDADES
// ============================================================================
export interface FinancialTitleEntity {
  id: string;
  tenantId: string;
  type: TitleType;
  status: TitleStatus;
  origin: TitleOrigin;
  titleNumber: string;
  description?: string;
  originalAmount: number;
  balance: number;
  paidAmount: number;
  dueDate: Date;
  issueDate: Date;
  paidAt?: Date;
  customerId?: string;
  customerName?: string;
  supplierId?: string;
  supplierName?: string;
  categoryId?: string;
  categoryName?: string;
  orderId?: string;
  installmentNumber: number;
  totalInstallments: number;
  movements: FinancialMovementEntity[];
  createdAt: Date;
  updatedAt: Date;
}

export interface FinancialMovementEntity {
  id: string;
  tenantId: string;
  titleId: string;
  type: MovementType;
  amount: number;
  paymentDate: Date;
  userId?: string;
  observation?: string;
  createdAt: Date;
}

// ============================================================================
// INPUTS
// ============================================================================
export interface CreateFinancialTitleInput {
  tenantId: string;
  type: TitleType;
  origin?: TitleOrigin;
  titleNumber?: string;
  description?: string;
  originalAmount: number;
  dueDate: Date;
  issueDate?: Date;
  competenceDate?: Date;
  customerId?: string;
  supplierId?: string;
  categoryId?: string;
  orderId?: string;
  createdById?: string;
  installmentNumber?: number;
  totalInstallments?: number;
}

export interface UpdateFinancialTitleInput {
  description?: string;
  dueDate?: Date;
  status?: TitleStatus;
  paidAmount?: number;
  balance?: number;
  paidAt?: Date;
  categoryId?: string;
}

export interface CreateMovementInput {
  tenantId: string;
  titleId: string;
  type: MovementType;
  amount: number;
  paymentDate?: Date;
  userId?: string;
  observation?: string;
}

// ============================================================================
// FILTROS
// ============================================================================
export interface FinancialTitleFilter {
  type?: TitleType;
  status?: TitleStatus;
  origin?: TitleOrigin;
  categoryId?: string;
  customerId?: string;
  supplierId?: string;
  orderId?: string;
  dueDateFrom?: Date;
  dueDateTo?: Date;
  search?: string;
  page?: number;
  limit?: number;
  orderDirection?: 'asc' | 'desc';
}

export interface MonthlyTotal {
  month: number;
  year: number;
  total: number;
  paid: number;
  pending: number;
}

// ============================================================================
// REPOSITÓRIO
// ============================================================================
export abstract class FinancialTitleRepository {
  // Base CRUD
  abstract findById(id: string): Promise<FinancialTitleEntity | null>;
  abstract findByTenantAndId(
    tenantId: string,
    id: string,
  ): Promise<FinancialTitleEntity | null>;
  abstract findAll(
    tenantId: string,
    filter?: FinancialTitleFilter,
  ): Promise<PaginationResult<FinancialTitleEntity>>;
  abstract create(
    input: CreateFinancialTitleInput,
  ): Promise<FinancialTitleEntity>;
  abstract update(
    id: string,
    input: UpdateFinancialTitleInput,
  ): Promise<FinancialTitleEntity>;
  abstract delete(id: string): Promise<void>;
  abstract softDelete(id: string): Promise<void>;
  abstract count(
    tenantId: string,
    filter?: FinancialTitleFilter,
  ): Promise<number>;
  abstract exists(id: string): Promise<boolean>;

  // Domain methods
  abstract findOverdueTitles(
    tenantId: string,
    referenceDate?: Date,
  ): Promise<FinancialTitleEntity[]>;

  // Movements
  abstract createMovement(
    input: CreateMovementInput,
  ): Promise<FinancialMovementEntity>;
  abstract findMovementsByTitle(
    titleId: string,
  ): Promise<FinancialMovementEntity[]>;

  // Aggregations
  abstract sumByStatus(
    tenantId: string,
    statuses: TitleStatus[],
  ): Promise<number>;
  abstract getMonthlyTotals(
    tenantId: string,
    type: TitleType,
    year: number,
  ): Promise<MonthlyTotal[]>;
}
