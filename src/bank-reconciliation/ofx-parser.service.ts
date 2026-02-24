import { Injectable, BadRequestException } from '@nestjs/common';
import * as ofx from 'ofx';

export interface ParsedBankTransaction {
  fitId: string;
  type: 'CREDIT' | 'DEBIT';
  amount: number;
  date: Date;
  description: string;
}

@Injectable()
export class OfxParserService {
  parse(ofxContent: string): ParsedBankTransaction[] {
    try {
      const data = ofx.parse(ofxContent);

      // O caminho do extrato no objeto OFX depende da versão, mas esse é o padrão universal
      const statementTransactions =
        data?.OFX?.BANKMSGSRSV1?.STMTTRNRS?.STMTRS?.BANKTRANLIST?.STMTTRN;

      if (!statementTransactions) {
        throw new Error('Nenhuma transação encontrada no arquivo OFX.');
      }

      // Se for só uma transação, o OFX retorna um objeto em vez de array. Garantimos o array:
      const transactions = Array.isArray(statementTransactions)
        ? statementTransactions
        : [statementTransactions];

      return transactions.map((tx: any) => ({
        fitId: tx.FITID,
        type: Number(tx.TRNAMT) >= 0 ? 'CREDIT' : 'DEBIT',
        amount: Math.abs(Number(tx.TRNAMT)), // Salvamos sempre positivo, o "type" dita o que é
        date: this.parseOfxDate(tx.DTPOSTED),
        description: tx.MEMO || tx.NAME || 'Transação sem descrição',
      }));
    } catch (error) {
      throw new BadRequestException(
        `Falha ao ler o arquivo OFX: ${error.message}`,
      );
    }
  }

  // Datas do OFX vêm num formato horrível ex: "20260228100000[-3:BRT]"
  private parseOfxDate(dateStr: string): Date {
    if (!dateStr) return new Date();
    const year = parseInt(dateStr.substring(0, 4));
    const month = parseInt(dateStr.substring(4, 6)) - 1; // Mês no JS começa em 0
    const day = parseInt(dateStr.substring(6, 8));
    return new Date(year, month, day, 12, 0, 0); // Forçamos meio-dia para evitar bug de fuso horário
  }
}
