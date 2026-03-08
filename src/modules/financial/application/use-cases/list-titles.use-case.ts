import { Injectable } from '@nestjs/common';
import {
  FinancialTitleRepository,
  FinancialTitleFilter,
} from '../../../../core/application/ports/repositories/financial-title.repository';
import { TitleType, TitleStatus } from '../../../../core/domain/enums';

export interface ListTitlesQuery {
  tenantId: string;
  type?: TitleType;
  status?: TitleStatus;
  categoryId?: string;
  customerId?: string;
  supplierId?: string;
  dueDateFrom?: Date;
  dueDateTo?: Date;
  search?: string;
  page?: number;
  limit?: number;
  orderBy?: string;
  orderDirection?: 'asc' | 'desc';
}

export interface TitleSummary {
  id: string;
  titleNumber: string;
  description?: string;
  originalAmount: number;
  paidAmount: number;
  balance: number;
  dueDate: Date;
  status: TitleStatus;
  type: TitleType;
  customerName?: string;
  supplierName?: string;
  categoryName?: string;
  isOverdue: boolean;
}

export interface ListTitlesResult {
  titles: TitleSummary[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
  };
  totals: {
    totalAmount: number;
    totalPaid: number;
    totalPending: number;
    totalOverdue: number;
  };
}

@Injectable()
export class ListTitlesUseCase {
  constructor(private readonly titleRepository: FinancialTitleRepository) {}

  async execute(query: ListTitlesQuery): Promise<ListTitlesResult> {
    const filter: FinancialTitleFilter = {
      type: query.type,
      status: query.status,
      categoryId: query.categoryId,
      customerId: query.customerId,
      supplierId: query.supplierId,
      dueDateFrom: query.dueDateFrom,
      dueDateTo: query.dueDateTo,
      search: query.search,
      page: query.page ?? 1,
      limit: query.limit ?? 20,
      orderDirection: query.orderDirection ?? 'asc',
    };

    const result = await this.titleRepository.findAll(query.tenantId, filter);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let totalAmount = 0;
    let totalPaid = 0;
    let totalPending = 0;
    let totalOverdue = 0;

    const titles: TitleSummary[] = result.data.map((title) => {
      const isOverdue =
        title.status !== TitleStatus.PAID &&
        title.status !== TitleStatus.CANCELLED &&
        new Date(title.dueDate) < today;

      totalAmount += title.originalAmount;
      totalPaid += title.paidAmount;
      totalPending += title.balance;
      if (isOverdue) totalOverdue += title.balance;

      return {
        id: title.id,
        titleNumber: title.titleNumber,
        description: title.description,
        originalAmount: title.originalAmount,
        paidAmount: title.paidAmount,
        balance: title.balance,
        dueDate: title.dueDate,
        status: title.status,
        type: title.type,
        customerName: title.customerName,
        supplierName: title.supplierName,
        categoryName: title.categoryName,
        isOverdue,
      };
    });

    return {
      titles,
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        totalPages: result.totalPages,
        hasNextPage: result.hasNextPage,
        hasPreviousPage: result.hasPreviousPage,
      },
      totals: {
        totalAmount,
        totalPaid,
        totalPending,
        totalOverdue,
      },
    };
  }
}
