import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTitleDto } from './dto/create-title.dto';
import { RegisterPaymentDto } from './dto/register-payment.dto';
import { User } from '@prisma/client';

@Injectable()
export class FinancialService {
  constructor(private readonly prisma: PrismaService) {}

  // --- GERAR TÍTULO (A RECEBER) ---
  async createReceivable(dto: CreateTitleDto, tenantId: string) {
    return this.prisma.financialTitle.create({
      data: {
        tenantId,
        type: 'RECEIVABLE',
        status: 'OPEN',
        titleNumber: dto.titleNumber,
        description: dto.description,
        customerId: dto.customerId,
        orderId: dto.orderId,
        originalAmount: dto.amount,
        balance: dto.amount, // Nasce devendo tudo
        dueDate: new Date(dto.dueDate),
        paymentMethod: dto.paymentMethod,
      },
    });
  }

  // --- REGISTRAR PAGAMENTO (BAIXA EM CASCATA) ---
  async registerPayment(dto: RegisterPaymentDto, tenantId: string, user: User) {
    // 1. Busca o título alvo inicial
    const initialTitle = await this.prisma.financialTitle.findUnique({
      where: { id: dto.titleId },
    });

    if (!initialTitle || initialTitle.tenantId !== tenantId) {
      throw new NotFoundException('Título não encontrado.');
    }

    // 2. Monta a lista de títulos a serem processados
    // Começa pelo atual, e busca os próximos do mesmo cliente se sobrar dinheiro
    let titlesToProcess = [initialTitle];
    const paymentAmountTotal = Number(dto.amount);
    let remainingMoney = paymentAmountTotal;

    // Se o valor pago é maior que o saldo do título atual, buscamos os próximos
    if (
      remainingMoney > Number(initialTitle.balance) &&
      initialTitle.customerId
    ) {
      const nextTitles = await this.prisma.financialTitle.findMany({
        where: {
          tenantId,
          customerId: initialTitle.customerId,
          status: { in: ['OPEN', 'PARTIAL'] }, // Apenas o que deve
          id: { not: initialTitle.id }, // Exclui o atual que já está na lista
          type: 'RECEIVABLE',
        },
        orderBy: { dueDate: 'asc' }, // Prioridade para os mais antigos
      });
      titlesToProcess = [...titlesToProcess, ...nextTitles];
    }

    const movementsCreated: any[] = [];

    // 3. Executa a Transação em Loop (Cascata)
    await this.prisma.$transaction(async (tx) => {
      for (const title of titlesToProcess) {
        if (remainingMoney <= 0) break; // Acabou o dinheiro

        const currentBalance = Number(title.balance);

        // Decide quanto vai pagar deste título (o saldo todo ou o que sobrou de dinheiro)
        const amountToPay = Math.min(currentBalance, remainingMoney);

        if (amountToPay <= 0) continue;

        // A. Registra Movimentação
        const movement = await tx.financialMovement.create({
          data: {
            tenantId,
            titleId: title.id,
            type: 'PAYMENT',
            amount: amountToPay,
            paymentDate: dto.paymentDate
              ? new Date(dto.paymentDate)
              : new Date(),
            userId: user.id,
            observation:
              title.id === initialTitle.id
                ? dto.observation
                : `Baixa automática por excedente do título ${initialTitle.titleNumber}`,
          },
        });
        movementsCreated.push(movement);

        // B. Atualiza Título
        const newBalance = currentBalance - amountToPay;
        await tx.financialTitle.update({
          where: { id: title.id },
          data: {
            balance: newBalance,
            status: newBalance <= 0.01 ? 'PAID' : 'PARTIAL',
          },
        });

        // C. Deduz do dinheiro disponível
        remainingMoney -= amountToPay;
      }

      // 4. GERAR CRÉDITO (Se pagou TUDO que devia e ainda sobrou dinheiro)
      if (remainingMoney > 0.01) {
        await tx.financialTitle.create({
          data: {
            tenantId,
            type: 'RECEIVABLE', // Poderia ser um tipo 'CREDIT' no futuro
            status: 'OPEN', // Aberto para uso
            titleNumber: `CRED-${initialTitle.titleNumber}`,
            description: `Crédito excedente do pagto. ${initialTitle.titleNumber}`,
            customerId: initialTitle.customerId,
            originalAmount: remainingMoney,
            balance: remainingMoney, // Saldo a favor
            dueDate: new Date(),
            // Idealmente adicionar uma flag isCredit: true no schema
          },
        });
      }
    });

    return {
      processedTitles: movementsCreated.length,
      creditGenerated: remainingMoney > 0.01 ? remainingMoney : 0,
    };
  }

  // --- EXTRATO DE TÍTULOS ---
  async findAll(
    tenantId: string,
    user: any,
    filters: {
      status?: string;
      customerId?: string;
      startDate?: string; // Filtro de Data Início
      endDate?: string; // Filtro de Data Fim
    },
  ) {
    const where: any = { tenantId };

    // Filtros básicos
    if (filters.status) where.status = filters.status;
    if (filters.customerId) where.customerId = filters.customerId;

    // Filtro de Período (Vencimento)
    if (filters.startDate || filters.endDate) {
      where.dueDate = {};

      if (filters.startDate) {
        const start = new Date(filters.startDate);
        // Força 00:00:00.000 UTC
        start.setUTCHours(0, 0, 0, 0);
        where.dueDate.gte = start;
      }

      if (filters.endDate) {
        const end = new Date(filters.endDate);
        // Força 23:59:59.999 UTC
        end.setUTCHours(23, 59, 59, 999);
        where.dueDate.lte = end;
      }
    }

    // --- LÓGICA DE SEGURANÇA PARA VENDEDOR ---
    if (user.role === 'SELLER') {
      where.customer = {
        sellerId: user.userId,
      };
    }

    return this.prisma.financialTitle.findMany({
      where,
      include: {
        customer: {
          select: { name: true, sellerId: true },
        },
        order: { select: { code: true } },
      },
      orderBy: { dueDate: 'asc' },
    });
  }

  async findOne(id: string, tenantId: string) {
    const title = await this.prisma.financialTitle.findUnique({
      where: { id },
      include: {
        customer: true,
        movements: {
          include: { user: { select: { name: true } } },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!title || title.tenantId !== tenantId) throw new NotFoundException();
    return title;
  }
}
