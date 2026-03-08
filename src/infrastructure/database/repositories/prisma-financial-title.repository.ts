import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  FinancialTitleRepository,
  FinancialTitleEntity,
  FinancialMovementEntity,
  CreateFinancialTitleInput,
  UpdateFinancialTitleInput,
  CreateMovementInput,
  FinancialTitleFilter,
  MonthlyTotal,
} from '../../../core/application/ports/repositories/financial-title.repository';
import { PaginationResult } from '../../../core/application/ports/repositories/base.repository';
import {
  TitleStatus as PrismaTitleStatus,
  TitleType as PrismaTitleType,
  TitleOrigin as PrismaTitleOrigin,
  MovementType as PrismaMovementType,
  FinancialTitle,
  FinancialMovement,
  Prisma,
} from '@prisma/client';
import {
  TitleStatus,
  TitleType,
  TitleOrigin,
  MovementType,
} from '../../../core/domain/enums';
import { toNumber } from '../../../core/utils';

type FinancialTitleWithRelations = FinancialTitle & {
  customer?: { id: string; tradeName: string | null } | null;
  supplier?: { id: string; tradeName: string | null } | null;
  category?: { id: string; name: string } | null;
  movements?: FinancialMovement[];
};

@Injectable()
export class PrismaFinancialTitleRepository extends FinancialTitleRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async softDelete(_id: string): Promise<void> {
    throw new Error('Soft delete not supported for financial titles');
  }

  async findById(id: string): Promise<FinancialTitleEntity | null> {
    const title = await this.prisma.financialTitle.findUnique({
      where: { id },
      include: this.defaultIncludes(),
    });
    return title ? this.mapToEntity(title) : null;
  }

  async findByTenantAndId(
    tenantId: string,
    id: string,
  ): Promise<FinancialTitleEntity | null> {
    const title = await this.prisma.financialTitle.findFirst({
      where: { id, tenantId },
      include: this.defaultIncludes(),
    });
    return title ? this.mapToEntity(title) : null;
  }

  async findAll(
    tenantId: string,
    filter?: FinancialTitleFilter,
  ): Promise<PaginationResult<FinancialTitleEntity>> {
    const where = this.buildWhereClause(tenantId, filter);
    const page = filter?.page ?? 1;
    const limit = filter?.limit ?? 20;
    const skip = (page - 1) * limit;

    const [titles, total] = await Promise.all([
      this.prisma.financialTitle.findMany({
        where,
        include: this.defaultIncludes(),
        skip,
        take: limit,
        orderBy: { dueDate: filter?.orderDirection ?? 'asc' },
      }),
      this.prisma.financialTitle.count({ where }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      data: titles.map((t) => this.mapToEntity(t)),
      total,
      page,
      limit,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    };
  }

  async create(
    input: CreateFinancialTitleInput,
  ): Promise<FinancialTitleEntity> {
    const title = await this.prisma.financialTitle.create({
      data: {
        tenantId: input.tenantId,
        type: input.type as PrismaTitleType,
        origin: (input.origin as PrismaTitleOrigin) ?? PrismaTitleOrigin.MANUAL,
        titleNumber: input.titleNumber ?? this.generateTitleNumber(),
        description: input.description,
        originalAmount: input.originalAmount,
        balance: input.originalAmount,
        paidAmount: 0,
        dueDate: input.dueDate,
        issueDate: input.issueDate ?? new Date(),
        competenceDate: input.competenceDate ?? new Date(),
        status: PrismaTitleStatus.OPEN,
        customerId: input.customerId,
        supplierId: input.supplierId,
        categoryId: input.categoryId,
        orderId: input.orderId,
        createdById: input.createdById,
        installmentNumber: input.installmentNumber ?? 1,
        totalInstallments: input.totalInstallments ?? 1,
      },
      include: this.defaultIncludes(),
    });

    return this.mapToEntity(title);
  }

  async update(
    id: string,
    input: UpdateFinancialTitleInput,
  ): Promise<FinancialTitleEntity> {
    const updateData: Prisma.FinancialTitleUpdateInput = {};

    if (input.description !== undefined)
      updateData.description = input.description;
    if (input.dueDate !== undefined) updateData.dueDate = input.dueDate;
    if (input.status !== undefined)
      updateData.status = input.status as PrismaTitleStatus;
    if (input.paidAmount !== undefined)
      updateData.paidAmount = input.paidAmount;
    if (input.balance !== undefined) updateData.balance = input.balance;
    if (input.paidAt !== undefined) updateData.paidAt = input.paidAt;
    if (input.categoryId !== undefined) {
      updateData.category = input.categoryId
        ? { connect: { id: input.categoryId } }
        : { disconnect: true };
    }

    const title = await this.prisma.financialTitle.update({
      where: { id },
      data: updateData,
      include: this.defaultIncludes(),
    });

    return this.mapToEntity(title);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.financialTitle.delete({ where: { id } });
  }

  async count(
    tenantId: string,
    filter?: FinancialTitleFilter,
  ): Promise<number> {
    return this.prisma.financialTitle.count({
      where: this.buildWhereClause(tenantId, filter),
    });
  }

  async exists(id: string): Promise<boolean> {
    const count = await this.prisma.financialTitle.count({ where: { id } });
    return count > 0;
  }

  async findOverdueTitles(
    tenantId: string,
    referenceDate?: Date,
  ): Promise<FinancialTitleEntity[]> {
    const date = referenceDate ?? new Date();
    const titles = await this.prisma.financialTitle.findMany({
      where: {
        tenantId,
        status: PrismaTitleStatus.OPEN,
        dueDate: { lt: date },
      },
      include: this.defaultIncludes(),
      orderBy: { dueDate: 'asc' },
    });
    return titles.map((t) => this.mapToEntity(t));
  }

  async createMovement(
    input: CreateMovementInput,
  ): Promise<FinancialMovementEntity> {
    const movement = await this.prisma.financialMovement.create({
      data: {
        tenantId: input.tenantId,
        titleId: input.titleId,
        type: input.type as PrismaMovementType,
        amount: input.amount,
        paymentDate: input.paymentDate ?? new Date(),
        userId: input.userId,
        observation: input.observation,
      },
    });

    return this.mapMovementToEntity(movement);
  }

  async findMovementsByTitle(
    titleId: string,
  ): Promise<FinancialMovementEntity[]> {
    const movements = await this.prisma.financialMovement.findMany({
      where: { titleId },
      orderBy: { paymentDate: 'desc' },
    });
    return movements.map((m) => this.mapMovementToEntity(m));
  }

  async sumByStatus(
    tenantId: string,
    statuses: TitleStatus[],
  ): Promise<number> {
    const prismaStatuses = statuses.map(
      (s) => s as unknown as PrismaTitleStatus,
    );
    const result = await this.prisma.financialTitle.aggregate({
      where: {
        tenantId,
        status: { in: prismaStatuses },
      },
      _sum: { originalAmount: true },
    });
    return toNumber(result._sum?.originalAmount ?? 0);
  }

  async getMonthlyTotals(
    tenantId: string,
    type: TitleType,
    year: number,
  ): Promise<MonthlyTotal[]> {
    const startDate = new Date(year, 0, 1);
    const endDate = new Date(year + 1, 0, 1);

    const titles = await this.prisma.financialTitle.findMany({
      where: {
        tenantId,
        type: type as PrismaTitleType,
        dueDate: {
          gte: startDate,
          lt: endDate,
        },
      },
      select: {
        dueDate: true,
        originalAmount: true,
        paidAmount: true,
        status: true,
      },
    });

    const monthlyMap = new Map<number, MonthlyTotal>();

    for (let i = 0; i < 12; i++) {
      monthlyMap.set(i, {
        month: i + 1,
        year,
        total: 0,
        paid: 0,
        pending: 0,
      });
    }

    for (const title of titles) {
      const month = title.dueDate.getMonth();
      const monthData = monthlyMap.get(month)!;
      const amount = toNumber(title.originalAmount);
      const paid = toNumber(title.paidAmount);

      monthData.total += amount;
      monthData.paid += paid;
      monthData.pending += amount - paid;
    }

    return Array.from(monthlyMap.values());
  }

  private defaultIncludes() {
    return {
      customer: { select: { id: true, tradeName: true } },
      supplier: { select: { id: true, tradeName: true } },
      category: { select: { id: true, name: true } },
      movements: true,
    };
  }

  private buildWhereClause(
    tenantId: string,
    filter?: FinancialTitleFilter,
  ): Prisma.FinancialTitleWhereInput {
    const where: Prisma.FinancialTitleWhereInput = { tenantId };

    if (filter?.type) {
      where.type = filter.type as PrismaTitleType;
    }
    if (filter?.status) {
      where.status = filter.status as PrismaTitleStatus;
    }
    if (filter?.origin) {
      where.origin = filter.origin as PrismaTitleOrigin;
    }
    if (filter?.categoryId) {
      where.categoryId = filter.categoryId;
    }
    if (filter?.customerId) {
      where.customerId = filter.customerId;
    }
    if (filter?.supplierId) {
      where.supplierId = filter.supplierId;
    }
    if (filter?.orderId) {
      where.orderId = filter.orderId;
    }
    if (filter?.dueDateFrom || filter?.dueDateTo) {
      where.dueDate = {};
      if (filter.dueDateFrom) where.dueDate.gte = filter.dueDateFrom;
      if (filter.dueDateTo) where.dueDate.lte = filter.dueDateTo;
    }
    if (filter?.search) {
      where.OR = [
        { description: { contains: filter.search, mode: 'insensitive' } },
        { titleNumber: { contains: filter.search, mode: 'insensitive' } },
      ];
    }

    return where;
  }

  private mapToEntity(
    title: FinancialTitleWithRelations,
  ): FinancialTitleEntity {
    return {
      id: title.id,
      tenantId: title.tenantId,
      type: title.type as unknown as TitleType,
      origin: title.origin as unknown as TitleOrigin,
      status: title.status as unknown as TitleStatus,
      titleNumber: title.titleNumber,
      description: title.description ?? undefined,
      originalAmount: toNumber(title.originalAmount),
      balance: toNumber(title.balance),
      paidAmount: toNumber(title.paidAmount),
      dueDate: title.dueDate,
      issueDate: title.issueDate,
      paidAt: title.paidAt ?? undefined,
      customerId: title.customerId ?? undefined,
      customerName: title.customer?.tradeName ?? undefined,
      supplierId: title.supplierId ?? undefined,
      supplierName: title.supplier?.tradeName ?? undefined,
      categoryId: title.categoryId ?? undefined,
      categoryName: title.category?.name ?? undefined,
      orderId: title.orderId ?? undefined,
      installmentNumber: title.installmentNumber ?? 1,
      totalInstallments: title.totalInstallments ?? 1,
      movements: title.movements?.map((m) => this.mapMovementToEntity(m)) ?? [],
      createdAt: title.createdAt,
      updatedAt: title.updatedAt,
    };
  }

  private mapMovementToEntity(
    movement: FinancialMovement,
  ): FinancialMovementEntity {
    return {
      id: movement.id,
      tenantId: movement.tenantId,
      titleId: movement.titleId,
      type: movement.type as unknown as MovementType,
      amount: toNumber(movement.amount),
      paymentDate: movement.paymentDate,
      userId: movement.userId ?? undefined,
      observation: movement.observation ?? undefined,
      createdAt: movement.createdAt,
    };
  }

  private generateTitleNumber(): string {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `TIT-${timestamp}-${random}`;
  }
}
