import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  BadRequestException,
  UseGuards,
  Param,
} from '@nestjs/common';
import { BankReconciliationService } from './bank-reconciliation.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ClerkAuthGuard } from 'src/auth/guards/clerk-auth.guard';

@Controller('bank-reconciliation')
@UseGuards(ClerkAuthGuard)
export class BankReconciliationController {
  constructor(
    private readonly bankReconciliationService: BankReconciliationService,
  ) {}

  @Get('pending')
  async getPending(
    @Query('bankAccountId') bankAccountId: string,
    @CurrentUser() user: any,
  ) {
    if (!bankAccountId) {
      throw new BadRequestException('O ID da conta bancária é obrigatório.');
    }

    return this.bankReconciliationService.getPendingTransactions(
      bankAccountId,
      user.tenantId,
    );
  }

  @Post('match')
  async reconcileTransaction(
    @Body()
    body: {
      bankTransactionId: string;
      financialTitleId?: string;
      financialMovementId?: string;
    },
    @CurrentUser() user: any,
  ) {
    if (!body.bankTransactionId) {
      throw new BadRequestException(
        'O ID da transação bancária é obrigatório.',
      );
    }

    // CENÁRIO 1: O usuário enviou um Título em aberto para dar baixa
    if (body.financialTitleId) {
      return this.bankReconciliationService.reconcileWithTitle(
        body.bankTransactionId,
        body.financialTitleId,
        user.tenantId,
        user.userId || user.id, // Use a propriedade correta do seu payload de JWT
      );
    }

    // CENÁRIO 2: O usuário enviou um Movimento já existente para validar
    if (body.financialMovementId) {
      return this.bankReconciliationService.reconcileWithMovement(
        body.bankTransactionId,
        body.financialMovementId,
        user.tenantId,
      );
    }

    // Fallback de segurança
    throw new BadRequestException(
      'É necessário informar um Título ou um Movimento para realizar a conciliação.',
    );
  }

  @Get('pending/:bankAccountId')
  async getPendingByBankAccount(
    @Param('bankAccountId') bankAccountId: string,
    @CurrentUser() user: any,
    @Query('bankStatementId') bankStatementId?: string,
  ) {
    return this.bankReconciliationService.getPendingTransactions(
      bankAccountId,
      user.tenantId,
      bankStatementId,
    );
  }

  @Post('upload')
  async uploadOfx(
    @Body()
    body: { bankAccountId: string; fileContent: string; fileName: string },
    @CurrentUser() user: any,
  ) {
    if (!body.bankAccountId || !body.fileContent) {
      throw new BadRequestException(
        'ID da conta bancária e conteúdo do arquivo são obrigatórios.',
      );
    }

    return this.bankReconciliationService.processOfxFile(
      body.bankAccountId,
      body.fileContent,
      body.fileName,
      user.tenantId,
    );
  }

  @Get('history')
  async getHistory(
    @Query('bankAccountId') bankAccountId: string,
    @CurrentUser() user: any,
  ) {
    if (!bankAccountId) {
      throw new BadRequestException('O ID da conta bancária é obrigatório.');
    }

    return this.bankReconciliationService.getReconciliationHistory(
      bankAccountId,
      user.tenantId,
    );
  }
}
