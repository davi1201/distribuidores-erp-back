import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  User,
  FinancialTitle,
  Prisma,
  TitleOrigin,
  TitleType,
  MovementType,
  TitleStatus,
} from '@prisma/client';
import { addDays } from 'date-fns';
import { CreateTitleDto } from './dto/create-title.dto';
import { RegisterPaymentDto } from './dto/register-payment.dto';

const generateDocNumber = (doc: string | number) => {
  const num = Number(doc);
  if (isNaN(num)) return String(doc);
  return String(num).padStart(4, '0');
};

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
  importId?: string;
  paymentTermId?: string;
  installmentsPlan?: InstallmentRule[];
  startDate?: Date | string;
  paymentMethodId?: string;
  categoryId?: string;
}

@Injectable()
export class FinancialService {
  constructor(private readonly prisma: PrismaService) {}

  async createTitle(dto: CreateTitleDto, tenantId: string, userId: string) {
    this.validateTitleCreation(dto);

    const typeEnum =
      dto.type === 'PAYABLE' ? TitleType.PAYABLE : TitleType.RECEIVABLE;

    const titleNumber =
      dto.titleNumber ||
      `${typeEnum === TitleType.PAYABLE ? 'P' : 'R'}-${Date.now()}`;

    if (dto.installments && dto.installments > 1) {
      const plan = Array.from({ length: dto.installments }).map((_, i) => ({
        days: i * 30,
        percent: 100 / dto.installments,
      }));

      await this.generateTitlesFromCondition({
        tenantId,
        userId,
        type: typeEnum,
        totalAmount: dto.amount,
        docNumber: titleNumber,
        descriptionPrefix: dto.description,
        customerId: dto.customerId,
        supplierId: dto.supplierId,
        categoryId: dto.categoryId,
        paymentMethodId: dto.paymentMethodId,
        installmentsPlan: plan,
        startDate: new Date(dto.dueDate),
      });
      return { success: true, message: 'Parcelas geradas' };
    }

    return this.prisma.financialTitle.create({
      data: {
        tenantId,
        type: typeEnum,
        origin: TitleOrigin.MANUAL,
        status: TitleStatus.OPEN,
        titleNumber,
        description: dto.description,
        originalAmount: Number(dto.amount),
        balance: Number(dto.amount),
        dueDate: new Date(dto.dueDate),
        installmentNumber: 1,
        totalInstallments: 1,
        customerId: dto.customerId,
        supplierId: dto.supplierId,
        orderId: dto.orderId,
        importId: dto.importId,
        categoryId: dto.categoryId,
        paymentMethodId: dto.paymentMethodId,
        createdById: userId,
      },
    });
  }

  async generateTitlesFromCondition(config: GenerateTitlesConfig) {
    const { tenantId, type, customerId, supplierId } = config;

    if (type === TitleType.RECEIVABLE && !customerId)
      throw new BadRequestException(
        'Cliente obrigatório para contas a receber.',
      );
    if (type === TitleType.PAYABLE && !supplierId)
      throw new BadRequestException(
        'Fornecedor obrigatório para contas a pagar.',
      );

    const plan = await this.resolveInstallmentPlan(tenantId, config);
    const titlesData = this.calculateInstallmentsData(plan, config);

    if (titlesData.length > 0) {
      await this.prisma.financialTitle.createMany({ data: titlesData });
    }
  }

  async generatePayablesFromImport(
    tenantId: string,
    userId: string,
    config: any,
  ) {
    return this.generateTitlesFromCondition({
      tenantId,
      userId,
      type: TitleType.PAYABLE,
      totalAmount: config.totalAmount,
      docNumber: config.invoiceNumber,
      descriptionPrefix: 'Importação NF',
      supplierId: config.supplierId,
      importId: config.importId ? String(config.importId) : undefined,
      paymentTermId: config.paymentTermId,
      installmentsPlan: config.installmentsPlan,
      startDate: config.firstDueDate || config.startDate,
      paymentMethodId: config.paymentMethodId,
    });
  }

  async registerMovement(
    dto: RegisterPaymentDto | RegisterPaymentDto[], // Aceita um ou vários
    tenantId: string,
    user: User,
  ) {
    const payments = Array.isArray(dto) ? dto : [dto];

    const movementsCreated: any[] = [];
    let totalRemainingMoney = 0;

    await this.prisma.$transaction(async (tx) => {
      for (const payment of payments) {
        const initialTitle = await tx.financialTitle.findUnique({
          where: { id: payment.titleId },
        });

        if (!initialTitle || initialTitle.tenantId !== tenantId) {
          throw new NotFoundException(
            `Título ${payment.titleId} não encontrado.`,
          );
        }

        const titlesToProcess = await this.resolveTitlesToProcess(
          initialTitle,
          Number(payment.amount),
          tx,
        );

        let remainingMoney = Number(payment.amount);

        for (const title of titlesToProcess) {
          if (remainingMoney <= 0) break;

          const currentBalance = Number(title.balance);
          const amountToPay = Math.min(currentBalance, remainingMoney);

          if (amountToPay <= 0) continue;

          const movementType =
            title.type === TitleType.RECEIVABLE
              ? MovementType.RECEIPT
              : MovementType.PAYMENT;

          const movement = await tx.financialMovement.create({
            data: {
              tenantId,
              titleId: title.id,
              bankAccountId: payment.bankAccountId,
              type: movementType,
              amount: amountToPay,
              paymentDate: payment.paymentDate
                ? new Date(payment.paymentDate)
                : new Date(),
              userId: user.id,
              paymentMethodId: payment.paymentMethodId,
              observation:
                title.id === initialTitle.id
                  ? payment.observation
                  : `Baixa automática cascata ref. ${initialTitle.titleNumber}`,
            },
          });

          movementsCreated.push(movement);

          const newBalance = currentBalance - amountToPay;
          await tx.financialTitle.update({
            where: { id: title.id },
            data: {
              balance: newBalance,
              status:
                newBalance <= 0.01 ? TitleStatus.PAID : TitleStatus.PARTIAL,
            },
          });

          remainingMoney -= amountToPay;
        }

        if (
          remainingMoney > 0.01 &&
          initialTitle.type === TitleType.RECEIVABLE
        ) {
          await this.createCreditTitle(
            tx,
            initialTitle,
            remainingMoney,
            user.id,
          );
          totalRemainingMoney += remainingMoney;
        }
      }
    });

    return {
      success: true,
      processedTitles: movementsCreated.length,
      creditGenerated: totalRemainingMoney,
      message: Array.isArray(dto)
        ? 'Baixa em lote processada com sucesso!'
        : 'Baixa processada com sucesso!',
    };
  }

  async findAll(tenantId: string, user: any, filters: any) {
    const where: Prisma.FinancialTitleWhereInput = { tenantId };

    if (filters.type) where.type = filters.type;
    if (filters.status) where.status = filters.status;
    if (filters.customerId) where.customerId = filters.customerId;
    if (filters.supplierId) where.supplierId = filters.supplierId;

    if (filters.startDate || filters.endDate) {
      where.dueDate = {};
      if (filters.startDate) where.dueDate.gte = new Date(filters.startDate);
      if (filters.endDate) where.dueDate.lte = new Date(filters.endDate);
    }

    if (user.role === 'SELLER') {
      where.type = TitleType.RECEIVABLE;
      where.customer = { sellerId: user.userId };
    }

    return this.prisma.financialTitle.findMany({
      where,
      include: {
        customer: { select: { name: true } },
        supplier: { select: { name: true } },
        category: { select: { name: true } },
        createdBy: { select: { name: true } },
        paymentMethod: { select: { name: true, code: true } },
        paymentTerm: { select: { name: true } },
      },
      orderBy: { dueDate: 'asc' },
    });
  }

  async findAllPaymentMethods(tenantId: string) {
    return this.prisma.paymentMethod.findMany({
      where: { tenantId, isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  private validateTitleCreation(dto: CreateTitleDto) {
    if (dto.type === 'RECEIVABLE' && !dto.customerId) {
      throw new BadRequestException('Contas a receber exigem um Cliente.');
    }
    if (dto.type === 'PAYABLE' && !dto.supplierId && !dto.description) {
      throw new BadRequestException(
        'Contas a pagar exigem Fornecedor ou Descrição.',
      );
    }
  }

  private async resolveInstallmentPlan(
    tenantId: string,
    config: GenerateTitlesConfig,
  ): Promise<InstallmentRule[]> {
    const { paymentTermId, installmentsPlan } = config;
    let plan: InstallmentRule[] = installmentsPlan || [];

    if (plan.length > 0) {
      return plan;
    }

    if (paymentTermId) {
      const term = await this.prisma.paymentTerm.findUnique({
        where: { id: paymentTermId, tenantId },
      });

      if (term) {
        try {
          let dbRules: string | InstallmentRule[] = term['rules'];

          if (typeof dbRules === 'string') {
            try {
              dbRules = JSON.parse(dbRules);
            } catch (parseError) {
              console.error(
                'Erro ao fazer parse do JSON de regras:',
                parseError,
              );
              dbRules = [];
            }
          }

          const isFlexible = term['isFlexible'];

          if (!isFlexible || plan.length === 0) {
            if (Array.isArray(dbRules) && dbRules.length > 0) {
              plan = dbRules.map((r: any) => ({
                days: Number(r.days),
                percent: Number(r.percent),
                fixedAmount: r.fixedAmount ? Number(r.fixedAmount) : undefined,
              }));
            }
          }
        } catch (e) {
          console.error(`Erro regras termo ${paymentTermId}`, e);
        }
      }
    }

    if (plan.length === 0) {
      plan = [{ days: 0, percent: 100 }];
    }

    return plan;
  }

  private calculateInstallmentsData(
    plan: InstallmentRule[],
    config: GenerateTitlesConfig,
  ) {
    const {
      totalAmount,
      startDate,
      docNumber,
      tenantId,
      userId,
      type,
      customerId,
      supplierId,
      orderId,
      importId,
      paymentMethodId,
      descriptionPrefix,
      paymentTermId,
    } = config;

    const baseDate = startDate ? new Date(startDate) : new Date();
    const safeImportId = importId ? String(importId) : null;

    let origin: TitleOrigin = TitleOrigin.MANUAL;
    if (orderId) origin = TitleOrigin.ORDER;
    else if (importId) origin = TitleOrigin.IMPORT;

    const titlesToCreate: Prisma.FinancialTitleCreateManyInput[] = [];
    let remainingBalance = totalAmount;

    const formattedDocNumber = generateDocNumber(docNumber);

    for (let i = 0; i < plan.length; i++) {
      const rule = plan[i];
      const isLast = i === plan.length - 1;
      let amount = 0;

      if (rule.fixedAmount) {
        amount = Number(rule.fixedAmount);
      } else {
        const pct = rule.percent || 100 / plan.length;
        amount = Number(((totalAmount * pct) / 100).toFixed(2));
      }

      if (isLast) {
        amount = Number(remainingBalance.toFixed(2));
      }

      remainingBalance -= amount;

      if (amount <= 0 && remainingBalance <= 0 && plan.length > 1) continue;

      const dueDate = addDays(baseDate, rule.days);
      const parcelLabel = `${i + 1}`;

      const description = `${descriptionPrefix} - Parc ${parcelLabel}/${plan.length}`;

      titlesToCreate.push({
        tenantId,
        type,
        origin,
        status: TitleStatus.OPEN,

        titleNumber: `${formattedDocNumber}/${parcelLabel}`,
        description,

        installmentNumber: i + 1,
        totalInstallments: plan.length,

        originalAmount: amount,
        balance: amount,
        dueDate,

        customerId,
        supplierId,
        orderId,
        importId: safeImportId,

        paymentMethodId: paymentMethodId || null,
        paymentTermId: paymentTermId || null,

        createdById: userId,
      });
    }

    return titlesToCreate;
  }

  private async resolveTitlesToProcess(
    initialTitle: FinancialTitle,
    amountPaid: number,
    tx?: Prisma.TransactionClient, // <-- NOVO: Aceita a transação opcional
  ) {
    const dbClient = tx || this.prisma; // Usa a transação se existir, senão usa o Prisma normal
    const titles = [initialTitle];

    if (
      initialTitle.type === TitleType.RECEIVABLE &&
      initialTitle.customerId &&
      amountPaid > Number(initialTitle.balance)
    ) {
      const nextTitles = await dbClient.financialTitle.findMany({
        where: {
          tenantId: initialTitle.tenantId,
          customerId: initialTitle.customerId,
          status: { in: [TitleStatus.OPEN, TitleStatus.PARTIAL] },
          id: { not: initialTitle.id },
          type: TitleType.RECEIVABLE,
        },
        orderBy: { dueDate: 'asc' },
      });
      titles.push(...nextTitles);
    }

    return titles;
  }

  private async createCreditTitle(
    tx: Prisma.TransactionClient,
    originTitle: FinancialTitle,
    amount: number,
    userId: string,
  ) {
    if (!originTitle.customerId) return;

    await tx.financialTitle.create({
      data: {
        tenantId: originTitle.tenantId,
        type: TitleType.RECEIVABLE,
        origin: TitleOrigin.MANUAL,
        status: TitleStatus.OPEN,
        titleNumber: `CRED-${originTitle.titleNumber}`,
        description: `Crédito gerado do pagto ${originTitle.titleNumber}`,
        customerId: originTitle.customerId,

        installmentNumber: 1,
        totalInstallments: 1,

        originalAmount: amount,
        balance: amount,
        dueDate: new Date(),
        createdById: userId,
      },
    });
  }

  async reconcileMovements(movementIds: string[], tenantId: string) {
    return this.prisma.financialMovement.updateMany({
      where: {
        id: { in: movementIds },
        tenantId,
      },
      data: {
        reconciled: true,
        reconciledAt: new Date(),
      },
    });
  }
}
