import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateBankAccountDto,
  UpdateBankAccountDto,
} from './dto/bank-account.dto';

// Core imports
import { ERROR_MESSAGES, ENTITY_NAMES } from '../core/constants';

@Injectable()
export class BankAccountsService {
  constructor(private readonly prisma: PrismaService) {}

  async createBankAccount(dto: CreateBankAccountDto, tenantId: string) {
    return this.prisma.bankAccount.create({
      data: {
        ...dto,
        tenantId,
        pixKeyType: dto.pixKeyType as any,
      },
    });
  }

  async findAllBankAccounts(tenantId: string, includeInactive = false) {
    return this.prisma.bankAccount.findMany({
      where: {
        tenantId,
        ...(!includeInactive && { isActive: true }),
      },
      orderBy: { name: 'asc' },
    });
  }

  async findOneBankAccount(id: string, tenantId: string) {
    const bankAccount = await this.prisma.bankAccount.findUnique({
      where: { id },
    });

    if (!bankAccount || bankAccount.tenantId !== tenantId) {
      throw new NotFoundException(
        ERROR_MESSAGES.NOT_FOUND(ENTITY_NAMES.BANK_ACCOUNT),
      );
    }

    return bankAccount;
  }

  async updateBankAccount(
    id: string,
    dto: UpdateBankAccountDto,
    tenantId: string,
  ) {
    await this.findOneBankAccount(id, tenantId);

    return this.prisma.bankAccount.update({
      where: { id },
      data: {
        ...dto,
        pixKeyType: dto.pixKeyType as any,
      },
    });
  }

  async removeBankAccount(id: string, tenantId: string) {
    await this.findOneBankAccount(id, tenantId);

    const transactionsCount = await this.prisma.bankTransaction.count({
      where: { bankAccountId: id },
    });

    const movementsCount = await this.prisma.financialMovement.count({
      where: { bankAccountId: id },
    });

    if (transactionsCount > 0 || movementsCount > 0) {
      return this.prisma.bankAccount.update({
        where: { id },
        data: { isActive: false },
      });
    }

    return this.prisma.bankAccount.delete({
      where: { id },
    });
  }
}
