import { Injectable } from '@nestjs/common';
import {
  FinancialTitleRepository,
  FinancialTitleEntity,
} from '../../../../core/application/ports/repositories/financial-title.repository';
import { TitleStatus, MovementType } from '../../../../core/domain/enums';
import { BusinessRuleException } from '../../../../common/exceptions/domain.exception';

export interface RegisterPaymentCommand {
  tenantId: string;
  userId: string;
  titleId: string;
  amount: number;
  paymentDate?: Date;
  description?: string;
  discountAmount?: number;
  interestAmount?: number;
  fineAmount?: number;
}

export interface RegisterPaymentResult {
  movementId: string;
  paidAmount: number;
  remainingAmount: number;
  newStatus: TitleStatus;
  isFullyPaid: boolean;
}

@Injectable()
export class RegisterPaymentUseCase {
  constructor(private readonly titleRepository: FinancialTitleRepository) {}

  async execute(
    command: RegisterPaymentCommand,
  ): Promise<RegisterPaymentResult> {
    const title = await this.titleRepository.findByTenantAndId(
      command.tenantId,
      command.titleId,
    );

    if (!title) {
      throw new BusinessRuleException(
        'Título não encontrado',
        'TITLE_NOT_FOUND',
      );
    }

    this.validateTitleCanReceivePayment(title);
    this.validatePaymentAmount(command.amount, title);

    const netAmount = this.calculateNetAmount(command);
    const newPaidAmount = title.paidAmount + netAmount;
    const remainingAmount = title.originalAmount - newPaidAmount;
    const isFullyPaid = remainingAmount <= 0;
    const newStatus = isFullyPaid ? TitleStatus.PAID : TitleStatus.PARTIAL;

    // Criar movimentação
    const movement = await this.titleRepository.createMovement({
      tenantId: command.tenantId,
      titleId: command.titleId,
      type: MovementType.PAYMENT,
      amount: netAmount,
      paymentDate: command.paymentDate ?? new Date(),
      userId: command.userId,
      observation: command.description,
    });

    // Atualizar título
    await this.titleRepository.update(command.titleId, {
      paidAmount: newPaidAmount,
      balance: Math.max(0, remainingAmount),
      status: newStatus,
      paidAt: isFullyPaid ? new Date() : undefined,
    });

    return {
      movementId: movement.id,
      paidAmount: netAmount,
      remainingAmount: Math.max(0, remainingAmount),
      newStatus,
      isFullyPaid,
    };
  }

  private validateTitleCanReceivePayment(title: FinancialTitleEntity): void {
    if (title.status === TitleStatus.PAID) {
      throw new BusinessRuleException(
        'Este título já está pago',
        'TITLE_ALREADY_PAID',
      );
    }
    if (title.status === TitleStatus.CANCELLED) {
      throw new BusinessRuleException(
        'Não é possível registrar pagamento em título cancelado',
        'TITLE_CANCELLED',
      );
    }
  }

  private validatePaymentAmount(
    amount: number,
    title: FinancialTitleEntity,
  ): void {
    if (amount <= 0) {
      throw new BusinessRuleException(
        'O valor do pagamento deve ser maior que zero',
        'INVALID_PAYMENT_AMOUNT',
      );
    }

    const remainingAmount = title.originalAmount - title.paidAmount;
    if (amount > remainingAmount * 1.1) {
      throw new BusinessRuleException(
        'O valor do pagamento excede significativamente o saldo devedor',
        'PAYMENT_EXCEEDS_BALANCE',
      );
    }
  }

  private calculateNetAmount(command: RegisterPaymentCommand): number {
    const discount = command.discountAmount ?? 0;
    const interest = command.interestAmount ?? 0;
    const fine = command.fineAmount ?? 0;
    return command.amount - discount + interest + fine;
  }
}
