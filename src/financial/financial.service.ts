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
import { addDays, addMonths } from 'date-fns';
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
  orderPaymentId?: string;
  importId?: string;
  paymentTermId?: string;
  installmentsPlan?: InstallmentRule[];
  installmentCount?: number;
  startDate?: Date | string;
  tenantPaymentMethodId?: string;
  categoryId?: string;
  tx?: Prisma.TransactionClient; // 🔥 Opcional para não quebrar chamadas avulsas
}

@Injectable()
export class FinancialService {
  constructor(private readonly prisma: PrismaService) {}

  // ==========================================================================
  // CALCULADORA DE PDV
  // ==========================================================================
  async calculateSaleTotal(
    tenantId: string,
    tenantPaymentMethodId: string,
    baseTotal: number,
    installmentCount: number = 1,
  ) {
    const method = await this.prisma.tenantPaymentMethod.findUnique({
      where: { id: tenantPaymentMethodId },
      include: {
        systemPaymentMethod: true,
        installments: {
          where: { installment: installmentCount },
        },
      },
    });

    if (!method || method.tenantId !== tenantId) {
      throw new NotFoundException('Método de pagamento não encontrado.');
    }

    let finalTotal = baseTotal;
    let discountValue = 0;

    if (Number(method.discountPercentage) > 0) {
      discountValue = baseTotal * (Number(method.discountPercentage) / 100);
      finalTotal = baseTotal - discountValue;
    }

    let feeValue = 0;
    if (
      method.systemPaymentMethod.isAcquirer &&
      method.passFeeToCustomer &&
      method.installments.length > 0
    ) {
      const feePercentage = Number(method.installments[0].feePercentage);
      const divisor = (100 - feePercentage) / 100;
      const totalWithFee = divisor > 0 ? finalTotal / divisor : finalTotal;
      feeValue = totalWithFee - finalTotal;
      finalTotal = totalWithFee;
    }

    return {
      originalTotal: baseTotal,
      finalTotal: Math.round(finalTotal * 100) / 100,
      discountApplied: Math.round(discountValue * 100) / 100,
      feeValue: Math.round(feeValue * 100) / 100,
      installmentValue: Math.round((finalTotal / installmentCount) * 100) / 100,
    };
  }

  // ==========================================================================
  // GERAÇÃO DE TÍTULOS (Controller / Manual)
  // ==========================================================================
  async createTitle(
    dto: CreateTitleDto & { tenantPaymentMethodId?: string },
    tenantId: string,
    userId: string,
  ) {
    this.validateTitleCreation(dto);

    const typeEnum =
      dto.type === 'PAYABLE' ? TitleType.PAYABLE : TitleType.RECEIVABLE;
    const titleNumber =
      dto.titleNumber ||
      `${typeEnum === TitleType.PAYABLE ? 'P' : 'R'}-${Date.now()}`;
    const paymentMethodId =
      dto.tenantPaymentMethodId || (dto as any).paymentMethodId;

    if (dto.installments && dto.installments > 1) {
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
        tenantPaymentMethodId: paymentMethodId,
        installmentCount: dto.installments,
        startDate: new Date(dto.dueDate),
      });
      return { success: true, message: 'Parcelas geradas' };
    }

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
      tenantPaymentMethodId: paymentMethodId,
      installmentsPlan: [{ days: 0, percent: 100 }],
      installmentCount: 1,
      startDate: new Date(dto.dueDate),
    });

    return { success: true, message: 'Título gerado' };
  }

  async generateTitlesFromCondition(config: GenerateTitlesConfig) {
    const { tenantId, type, customerId, tx } = config;
    const prisma = tx || this.prisma;

    if (type === TitleType.RECEIVABLE && !customerId) {
      throw new BadRequestException(
        'Cliente obrigatório para contas a receber.',
      );
    }

    const { plan, finalTotalAmount } =
      await this.resolveInstallmentPlanAndAmount(tenantId, config);
    config.totalAmount = finalTotalAmount;

    const titlesData = this.calculateInstallmentsData(plan, config);

    if (titlesData.length > 0) {
      await prisma.financialTitle.createMany({ data: titlesData });
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
      tenantPaymentMethodId: config.tenantPaymentMethodId,
    });
  }

  // ==========================================================================
  // LÓGICA DE RESOLUÇÃO DE PARCELAS
  // ==========================================================================
  private async resolveInstallmentPlanAndAmount(
    tenantId: string,
    config: GenerateTitlesConfig,
  ): Promise<{ plan: InstallmentRule[]; finalTotalAmount: number }> {
    const {
      tenantPaymentMethodId,
      paymentTermId,
      installmentsPlan,
      totalAmount,
      tx,
    } = config;
    const prisma = tx || this.prisma;

    let plan: InstallmentRule[] = installmentsPlan || [];
    let finalTotalAmount = totalAmount;

    if (tenantPaymentMethodId) {
      const method = await prisma.tenantPaymentMethod.findUnique({
        where: { id: tenantPaymentMethodId },
        include: {
          systemPaymentMethod: true,
          installments: { orderBy: { installment: 'asc' } },
        },
      });

      if (method && method.systemPaymentMethod.isAcquirer) {
        const instCount = config.installmentCount || 1;
        const configParcela = method.installments.find(
          (i) => i.installment === instCount,
        );

        const newPlan: InstallmentRule[] = [];
        if (method.isAnticipated) {
          newPlan.push({
            days: configParcela?.receiveInDays || 1,
            percent: 100,
          });
        } else {
          for (let i = 1; i <= instCount; i++) {
            const current = method.installments.find(
              (inst) => inst.installment === i,
            );
            newPlan.push({
              days: (current?.receiveInDays || 30) * i,
              percent: 100 / instCount,
            });
          }
        }
        return { plan: newPlan, finalTotalAmount };
      }
    }

    if (plan.length === 0 && paymentTermId) {
      const term = await prisma.paymentTerm.findUnique({
        where: { id: paymentTermId },
      });

      if (term) {
        const dbRules = term.rules as any;
        if (Array.isArray(dbRules) && dbRules.length > 0) {
          plan = dbRules.map((r: any) => ({
            days: Number(r.days),
            percent: Number(r.percent),
            fixedAmount: r.fixedAmount ? Number(r.fixedAmount) : undefined,
          }));
        }
      }
    }

    if (plan.length === 0) plan = [{ days: 0, percent: 100 }];
    return { plan, finalTotalAmount };
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
      orderPaymentId,
      tenantPaymentMethodId,
      descriptionPrefix,
      paymentTermId,
    } = config;

    const baseDate = startDate ? new Date(startDate) : new Date();
    const formattedDocNumber = generateDocNumber(docNumber);
    const titlesToCreate: Prisma.FinancialTitleCreateManyInput[] = [];
    let remainingBalance = totalAmount;

    for (let i = 0; i < plan.length; i++) {
      const rule = plan[i];
      const isLast = i === plan.length - 1;

      let amount = rule.fixedAmount
        ? Number(rule.fixedAmount)
        : Number(
            ((totalAmount * (rule.percent || 100 / plan.length)) / 100).toFixed(
              2,
            ),
          );

      if (isLast) amount = Number(remainingBalance.toFixed(2));
      remainingBalance -= amount;

      if (amount <= 0 && remainingBalance <= 0 && plan.length > 1) continue;

      let dueDate: Date;
      if (rule.days === 0) {
        dueDate = baseDate;
      } else if (rule.days % 30 === 0) {
        dueDate = addMonths(baseDate, rule.days / 30);
      } else {
        dueDate = addDays(baseDate, rule.days);
      }

      const parcelLabel = `${i + 1}`;
      titlesToCreate.push({
        tenantId,
        type,
        origin: orderId ? TitleOrigin.ORDER : TitleOrigin.MANUAL,
        status: TitleStatus.OPEN,
        titleNumber: `${formattedDocNumber}/${parcelLabel}`,
        description: `${descriptionPrefix} - Parc ${parcelLabel}/${plan.length}`,
        installmentNumber: i + 1,
        totalInstallments: plan.length,
        originalAmount: amount,
        balance: amount,
        dueDate,
        customerId,
        supplierId,
        orderId,
        orderPaymentId,
        tenantPaymentMethodId: tenantPaymentMethodId || null,
        paymentTermId: paymentTermId || null,
        createdById: userId,
      });
    }

    return titlesToCreate;
  }

  // ==========================================================================
  // BAIXA DE TÍTULOS (registerMovement)
  // ==========================================================================
  async registerMovement(
    dto: RegisterPaymentDto | RegisterPaymentDto[],
    tenantId: string,
    user: any,
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

          const movement = await tx.financialMovement.create({
            data: {
              tenantId,
              titleId: title.id,
              bankAccountId: payment.bankAccountId,
              type:
                title.type === TitleType.RECEIVABLE
                  ? MovementType.RECEIPT
                  : MovementType.PAYMENT,
              amount: amountToPay,
              paymentDate: payment.paymentDate
                ? new Date(payment.paymentDate)
                : new Date(),
              userId: user.id,
              tenantPaymentMethodId:
                (payment as any).tenantPaymentMethodId ||
                (payment as any).paymentMethodId,
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
    };
  }

  // ==========================================================================
  // HELPERS RESTAURADOS
  // ==========================================================================
  private validateTitleCreation(dto: CreateTitleDto) {
    if (dto.type === 'RECEIVABLE' && !dto.customerId)
      throw new BadRequestException('Contas a receber exigem um Cliente.');
    if (dto.type === 'PAYABLE' && !dto.supplierId && !dto.description)
      throw new BadRequestException(
        'Contas a pagar exigem Fornecedor ou Descrição.',
      );
  }

  private async resolveTitlesToProcess(
    initialTitle: FinancialTitle,
    amountPaid: number,
    tx?: Prisma.TransactionClient,
  ) {
    const dbClient = tx || this.prisma;
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
      where: { id: { in: movementIds }, tenantId },
      data: { reconciled: true, reconciledAt: new Date() },
    });
  }

  async findAll(tenantId: string, user: any, filters: any) {
    const where: Prisma.FinancialTitleWhereInput = { tenantId };
    if (filters.type) where.type = filters.type;
    if (filters.status) where.status = filters.status;
    if (filters.customerId) where.customerId = filters.customerId;

    return this.prisma.financialTitle.findMany({
      where,
      include: {
        customer: { select: { name: true } },
        category: { select: { name: true } },
        tenantPaymentMethod: {
          select: {
            customName: true,
            systemPaymentMethod: { select: { name: true } },
          },
        },
        paymentTerm: { select: { name: true } },
      },
      orderBy: { dueDate: 'asc' },
    });
  }

  async findAllPaymentMethods(tenantId: string) {
    return this.prisma.tenantPaymentMethod.findMany({
      where: { tenantId, isActive: true },
      include: { systemPaymentMethod: true },
      orderBy: { customName: 'asc' },
    });
  }
}
