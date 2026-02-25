import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { MatchingEngineService } from './matching-engine.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { FinancialService } from '../financial/financial.service';
import { OfxParserService } from './ofx-parser.service';

// Tipagens de exemplo (O ideal é criar classes DTO separadas com class-validator)
export interface CreateBankAccountDto {
  name: string;
  agency?: string;
  accountNumber?: string;
  initialBalance?: number;
}

export interface UpdateBankAccountDto extends Partial<CreateBankAccountDto> {
  isActive?: boolean;
}

@Injectable()
export class BankReconciliationService {
  constructor(
    private prisma: PrismaService,
    private matcher: MatchingEngineService,
    private financialService: FinancialService,
    private ofxParser: OfxParserService,
  ) {}

  // =========================================================================
  // 1. CONCILIAÇÃO BANCÁRIA (Lógica já existente)
  // =========================================================================

  async getPendingTransactions(
    bankAccountId: string,
    tenantId: string,
    bankStatementId?: string, // <-- NOVO: Parâmetro opcional para isolar um OFX
  ) {
    const pendingBankTxs = await this.prisma.bankTransaction.findMany({
      where: {
        bankAccountId,
        status: 'PENDING',
        ...(bankStatementId && { bankStatementId }), // <-- Filtra pelo OFX se for passado
      },
      orderBy: { date: 'asc' },
    });

    const openTitles = await this.prisma.financialTitle.findMany({
      where: {
        tenantId,
        status: { in: ['OPEN', 'PARTIAL'] },
      },
      include: {
        customer: { select: { name: true } },
        supplier: { select: { name: true } },
      },
    });

    return pendingBankTxs.map((bankTx) => ({
      ...bankTx,
      suggestions: this.matcher.findSuggestions(bankTx, openTitles),
    }));
  }

  async reconcileWithTitle(
    bankTxId: string,
    financialTitleId: string,
    tenantId: string,
    userId: string,
  ) {
    const bankTx = await this.prisma.bankTransaction.findUnique({
      where: { id: bankTxId },
    });

    if (!bankTx || bankTx.status !== 'PENDING') {
      throw new BadRequestException(
        'Transação bancária inválida ou já conciliada.',
      );
    }

    const paymentDto = {
      titleId: financialTitleId,
      amount: Number(bankTx.amount),
      paymentDate: bankTx.date,
      bankAccountId: bankTx.bankAccountId,
      observation: `Baixa via Conciliação (OFX): ${bankTx.description}`,
    };

    await this.financialService.registerMovement(paymentDto as any, tenantId, {
      id: userId,
    } as any);

    const recentMovement = await this.prisma.financialMovement.findFirst({
      where: { titleId: financialTitleId, tenantId },
      orderBy: { createdAt: 'desc' },
    });

    if (!recentMovement) {
      throw new BadRequestException(
        'Falha ao localizar o movimento gerado pela baixa.',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.bankTransaction.update({
        where: { id: bankTxId },
        data: {
          status: 'RECONCILED',
          financialMovementId: recentMovement.id,
        },
      });
      await this.financialService.reconcileMovements(
        [recentMovement.id],
        tenantId,
      );
    });

    return { success: true, message: 'Conciliado e baixado com sucesso!' };
  }

  async reconcileWithMovement(
    bankTxId: string,
    movementId: string,
    tenantId: string,
  ) {
    const bankTx = await this.prisma.bankTransaction.findUnique({
      where: { id: bankTxId },
    });

    if (!bankTx || bankTx.status !== 'PENDING') {
      throw new BadRequestException(
        'Transação bancária inválida ou já conciliada.',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.bankTransaction.update({
        where: { id: bankTxId },
        data: {
          status: 'RECONCILED',
          financialMovementId: movementId,
        },
      });
      await this.financialService.reconcileMovements([movementId], tenantId);
    });

    return { success: true, message: 'Movimento validado e conciliado!' };
  }

  async processOfxFile(
    bankAccountId: string,
    fileContent: string,
    fileName: string,
    tenantId: string,
    forceProcess: boolean = false,
  ) {
    if (!forceProcess) {
      const existingStatement = await this.prisma.bankStatement.findFirst({
        where: { bankAccountId, fileName },
      });

      if (existingStatement) {
        throw new ConflictException({
          code: 'FILE_ALREADY_PROCESSED',
          statementId: existingStatement.id,
          message: `O arquivo "${fileName}" já foi importado anteriormente. Deseja recuperar os lançamentos pendentes dele?`,
        });
      }
    }

    // 2. Continua o processamento normal se for arquivo novo ou se `forceProcess` for true
    const parsedTransactions = this.ofxParser.parse(fileContent);

    const validTransactions = parsedTransactions.filter(
      (tx) => tx.fitId && typeof tx.amount === 'number' && !isNaN(tx.amount),
    );

    if (validTransactions.length === 0) {
      throw new BadRequestException(
        'Nenhuma transação válida encontrada neste arquivo OFX.',
      );
    }

    const statement = await this.prisma.bankStatement.create({
      data: {
        bankAccountId,
        fileName,
      },
    });

    await this.prisma.bankTransaction.createMany({
      data: validTransactions.map((tx) => ({
        bankAccountId,
        bankStatementId: statement.id,
        fitId: tx.fitId,
        type: tx.type,
        amount: tx.amount,
        date: tx.date,
        description: tx.description,
        status: 'PENDING',
      })),
      skipDuplicates: true,
    });

    return this.getPendingTransactions(bankAccountId, tenantId, statement.id);
  }

  async getReconciliationHistory(bankAccountId: string, tenantId: string) {
    const reconciledTxs = await this.prisma.bankTransaction.findMany({
      where: { bankAccountId, status: 'RECONCILED' },
      include: {
        financialMovement: {
          include: {
            title: {
              include: {
                customer: { select: { name: true } },
                supplier: { select: { name: true } },
              },
            },
          },
        },
      },
      orderBy: { date: 'desc' },
    });

    return reconciledTxs.map((tx) => ({
      ...tx,
      titleInfo: tx.financialMovement?.title
        ? {
            id: tx.financialMovement.title.id,
            type: tx.financialMovement.title.type,
            amount: tx.financialMovement.title.balance,
            dueDate: tx.financialMovement.title.dueDate,
            customerName:
              tx.financialMovement.title.customer?.name ||
              tx.financialMovement.title.supplier?.name ||
              'Sem nome',
          }
        : null,
    }));
  }
}
