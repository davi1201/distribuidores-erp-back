import { Injectable } from '@nestjs/common';
import { TransactionType, Prisma } from '@prisma/client';
import { differenceInDays } from 'date-fns';

export interface BankTransactionData {
  id: string;
  type: TransactionType | 'CREDIT' | 'DEBIT';
  amount: Prisma.Decimal | number | string;
  date: Date | string;
  description: string;
}

@Injectable()
export class MatchingEngineService {
  findSuggestions(bankTx: BankTransactionData, openTitles: any[]) {
    const suggestions: Array<{
      title: ReturnType<typeof this.formatTitleForFrontend>;
      confidence: 'HIGH' | 'MEDIUM';
      reason: string;
    }> = [];

    const bankAmount = Number(bankTx.amount);
    const bankDate = new Date(bankTx.date);

    for (const title of openTitles) {
      const isSameType =
        (bankTx.type === 'CREDIT' && title.type === 'RECEIVABLE') ||
        (bankTx.type === 'DEBIT' && title.type === 'PAYABLE');

      if (!isSameType) continue;

      const titleBalance = Number(title.balance);
      const isExactAmount = Math.abs(bankAmount - titleBalance) < 0.01;

      const titleDueDate = new Date(title.dueDate);
      const daysDiff = Math.abs(differenceInDays(bankDate, titleDueDate));

      if (isExactAmount && daysDiff === 0) {
        suggestions.push({
          title: this.formatTitleForFrontend(title),
          confidence: 'HIGH',
          reason: 'Valor exato pago no dia do vencimento.',
        });
        continue;
      }

      if (isExactAmount && daysDiff <= 3) {
        suggestions.push({
          title: this.formatTitleForFrontend(title),
          confidence: 'MEDIUM',
          reason: `Valor exato, pago com ${daysDiff} dia(s) de diferença.`,
        });
        continue;
      }
    }

    return suggestions.sort((a, b) => {
      if (a.confidence === 'HIGH' && b.confidence === 'MEDIUM') return -1;
      if (a.confidence === 'MEDIUM' && b.confidence === 'HIGH') return 1;
      return 0;
    });
  }

  private formatTitleForFrontend(title: any) {
    const personName =
      title.customer?.name || title.supplier?.name || 'Sem nome';

    return {
      id: title.id,
      description: title.description,
      customerName: personName, // <-- Campo isolado adicionado aqui
      amount: Number(title.balance),
      dueDate: title.dueDate,
      titleNumber: title.titleNumber,
    };
  }
}
