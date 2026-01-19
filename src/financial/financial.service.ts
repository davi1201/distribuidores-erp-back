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
  TitleOrigin, // <--- Importado
  TitleType, // <--- Importado
  MovementType, // <--- Importado
  TitleStatus, // <--- Importado
} from '@prisma/client';
import { addDays } from 'date-fns';
import { CreateTitleDto } from './dto/create-title.dto';
import { RegisterPaymentDto } from './dto/register-payment.dto';

// --- INTERFACES & TIPOS ---

export interface InstallmentRule {
  days: number;
  percent?: number;
  fixedAmount?: number;
}

export interface GenerateTitlesConfig {
  tenantId: string;
  userId: string;
  type: TitleType; // Usando o Enum
  totalAmount: number;
  docNumber: string;
  descriptionPrefix: string;

  // Relacionamentos
  customerId?: string;
  supplierId?: string;
  orderId?: string;
  importId?: string;

  // Configuração de Pagamento
  paymentTermId?: string;
  installmentsPlan?: InstallmentRule[];
  startDate?: Date | string;
  paymentMethodId?: string; // Alterado para ID
}

@Injectable()
export class FinancialService {
  constructor(private readonly prisma: PrismaService) {}

  // ===========================================================================
  // 1. GESTÃO DE TÍTULOS (CRUD Básico - Manual)
  // ===========================================================================

  async createTitle(dto: CreateTitleDto, tenantId: string, userId: string) {
    this.validateTitleCreation(dto);

    // Converte string do DTO para Enum do Prisma
    const typeEnum =
      dto.type === 'PAYABLE' ? TitleType.PAYABLE : TitleType.RECEIVABLE;

    const titleNumber =
      dto.titleNumber ||
      `${typeEnum === TitleType.PAYABLE ? 'P' : 'R'}-${Date.now()}`;

    return this.prisma.financialTitle.create({
      data: {
        tenantId,
        type: typeEnum,
        origin: TitleOrigin.MANUAL, // <--- Definido como Manual
        status: TitleStatus.OPEN,
        titleNumber,
        description: dto.description,
        originalAmount: Number(dto.amount),
        balance: Number(dto.amount),
        dueDate: new Date(dto.dueDate),

        // Rastreabilidade de Parcelas (Manual geralmente é 1 de 1)
        installmentNumber: 1,
        totalInstallments: 1,

        customerId: dto.customerId,
        supplierId: dto.supplierId,
        orderId: dto.orderId,
        importId: dto.importId,
        categoryId: dto.categoryId,

        // Relacionamentos Financeiros
        paymentMethodId: dto.paymentMethodId, // DTO deve enviar o ID agora
        createdById: userId,
      },
    });
  }

  // ===========================================================================
  // 2. GERAÇÃO AUTOMÁTICA DE TÍTULOS (CORE)
  // ===========================================================================

  async generateTitlesFromCondition(config: GenerateTitlesConfig) {
    const { tenantId, type, customerId, supplierId } = config;

    // Validações
    if (type === TitleType.RECEIVABLE && !customerId)
      throw new BadRequestException(
        'Cliente obrigatório para contas a receber.',
      );
    if (type === TitleType.PAYABLE && !supplierId)
      throw new BadRequestException(
        'Fornecedor obrigatório para contas a pagar.',
      );

    // 1. Resolve qual plano de parcelas usar
    const plan = await this.resolveInstallmentPlan(tenantId, config);

    // 2. Calcula os dados em memória
    const titlesData = this.calculateInstallmentsData(plan, config);

    // 3. Persiste no Banco
    if (titlesData.length > 0) {
      await this.prisma.financialTitle.createMany({ data: titlesData });
    }
  }

  // Alias para manter compatibilidade (Legacy)
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
      paymentMethodId: config.paymentMethodId, // Espera ID
    });
  }

  // ===========================================================================
  // 3. MOVIMENTAÇÃO FINANCEIRA (Baixa/Pagamento)
  // ===========================================================================

  async registerMovement(
    dto: RegisterPaymentDto,
    tenantId: string,
    user: User,
  ) {
    const initialTitle = await this.prisma.financialTitle.findUnique({
      where: { id: dto.titleId },
    });

    if (!initialTitle || initialTitle.tenantId !== tenantId) {
      throw new NotFoundException('Título não encontrado.');
    }

    const titlesToProcess = await this.resolveTitlesToProcess(
      initialTitle,
      Number(dto.amount),
    );

    let remainingMoney = Number(dto.amount);
    const movementsCreated = [];

    await this.prisma.$transaction(async (tx) => {
      for (const title of titlesToProcess) {
        if (remainingMoney <= 0) break;

        const currentBalance = Number(title.balance);
        const amountToPay = Math.min(currentBalance, remainingMoney);

        if (amountToPay <= 0) continue;

        // Define o tipo de movimento baseado no título
        const movementType =
          title.type === TitleType.RECEIVABLE
            ? MovementType.RECEIPT
            : MovementType.PAYMENT;

        // Cria movimento
        const movement = await tx.financialMovement.create({
          data: {
            tenantId,
            titleId: title.id,
            bankAccountId: dto.bankAccountId,
            type: movementType,
            amount: amountToPay,
            paymentDate: dto.paymentDate
              ? new Date(dto.paymentDate)
              : new Date(),
            userId: user.id,

            // NOVO: Registra qual meio de pagamento foi usado na BAIXA
            // (Pode ser diferente do previsto no título)
            paymentMethodId: dto.paymentMethodId,

            observation:
              title.id === initialTitle.id
                ? dto.observation
                : `Baixa automática cascata ref. ${initialTitle.titleNumber}`,
          },
        });
        // @ts-ignore
        movementsCreated.push(movement);

        // Atualiza saldo e status do título
        const newBalance = currentBalance - amountToPay;
        await tx.financialTitle.update({
          where: { id: title.id },
          data: {
            balance: newBalance,
            status: newBalance <= 0.01 ? TitleStatus.PAID : TitleStatus.PARTIAL,
          },
        });

        remainingMoney -= amountToPay;
      }

      // Gera crédito se sobrou dinheiro (Apenas para Recebimentos)
      if (remainingMoney > 0.01 && initialTitle.type === TitleType.RECEIVABLE) {
        await this.createCreditTitle(tx, initialTitle, remainingMoney, user.id);
      }
    });

    return {
      processedTitles: movementsCreated.length,
      remainingAmount: remainingMoney,
    };
  }

  // ===========================================================================
  // 4. CONSULTAS
  // ===========================================================================

  async findAll(tenantId: string, user: any, filters: any) {
    const where: Prisma.FinancialTitleWhereInput = { tenantId };

    if (filters.type) where.type = filters.type; // Enum
    if (filters.status) where.status = filters.status; // Enum
    if (filters.customerId) where.customerId = filters.customerId;
    if (filters.supplierId) where.supplierId = filters.supplierId;

    if (filters.startDate || filters.endDate) {
      where.dueDate = {};
      if (filters.startDate) where.dueDate.gte = new Date(filters.startDate);
      if (filters.endDate) where.dueDate.lte = new Date(filters.endDate);
    }

    if (user.role === 'SELLER') {
      where.type = TitleType.RECEIVABLE;
      where.customer = { sellerId: user.userId }; // Ajuste conforme seu schema User/Customer
    }

    return this.prisma.financialTitle.findMany({
      where,
      include: {
        customer: { select: { name: true } },
        supplier: { select: { name: true } },
        category: { select: { name: true } },
        createdBy: { select: { name: true } },
        // Inclui nomes amigáveis das configurações
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

  // ===========================================================================
  // MÉTODOS PRIVADOS (CORE LOGIC)
  // ===========================================================================

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

    // Se já veio um plano manual válido do front, usa ele e ignora o banco
    if (plan.length > 0) {
      return plan;
    }

    if (paymentTermId) {
      const term = await this.prisma.paymentTerm.findUnique({
        where: { id: paymentTermId, tenantId },
      });

      console.log('term encontrado:', term);

      if (term) {
        try {
          let dbRules: string | InstallmentRule[] = term['rules']; // Pega o valor cru (pode ser string ou Json)

          // 1. CORREÇÃO ESSENCIAL: Se for string, faz o parse
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

    // Fallback final
    if (plan.length === 0) {
      console.warn('Nenhuma regra encontrada, usando fallback (1x à vista)');
      plan = [{ days: 0, percent: 100 }];
    }

    console.log('Plano Final Resolvido:', plan);

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
      paymentMethodId, // ID
      descriptionPrefix,
      paymentTermId,
    } = config;

    const baseDate = startDate ? new Date(startDate) : new Date();
    const safeImportId = importId ? String(importId) : null;

    // Define a Origem baseado no contexto
    let origin: TitleOrigin = TitleOrigin.MANUAL;
    if (orderId) origin = TitleOrigin.ORDER;
    else if (importId) origin = TitleOrigin.IMPORT;

    const titlesToCreate: Prisma.FinancialTitleCreateManyInput[] = [];
    let remainingBalance = totalAmount;

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
      const isEntry = rule.days === 0;
      const parcelLabel = isEntry ? 'ENT' : `${i + 1}`;
      const description = `${descriptionPrefix} #${docNumber} - Parc ${parcelLabel}`;

      titlesToCreate.push({
        tenantId,
        type, // Enum
        origin, // Enum (Novo)
        status: TitleStatus.OPEN, // Enum

        titleNumber: `${docNumber}/${parcelLabel}`,
        description,

        // Parcelamento (Novo)
        installmentNumber: i + 1,
        totalInstallments: plan.length,

        originalAmount: amount,
        balance: amount,
        dueDate,

        customerId,
        supplierId,
        orderId,
        importId: safeImportId,

        // Vínculos Config
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
  ) {
    const titles = [initialTitle];

    if (
      initialTitle.type === TitleType.RECEIVABLE &&
      initialTitle.customerId &&
      amountPaid > Number(initialTitle.balance)
    ) {
      const nextTitles = await this.prisma.financialTitle.findMany({
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
    tx: Prisma.TransactionClient, // Tipagem correta para Transaction
    originTitle: FinancialTitle,
    amount: number,
    userId: string,
  ) {
    if (!originTitle.customerId) return;

    await tx.financialTitle.create({
      data: {
        tenantId: originTitle.tenantId,
        type: TitleType.RECEIVABLE,
        origin: TitleOrigin.MANUAL, // Crédito gerado é considerado manual/ajuste
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
        tenantId, // Garante que só concilia movimentos do próprio tenant
      },
      data: {
        reconciled: true,
        reconciledAt: new Date(),
      },
    });
  }
}
