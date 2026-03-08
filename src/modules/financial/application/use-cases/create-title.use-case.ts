import { Injectable } from '@nestjs/common';
import { FinancialTitleRepository } from '../../../../core/application/ports/repositories/financial-title.repository';
import {
  TitleType,
  TitleOrigin,
  TitleStatus,
} from '../../../../core/domain/enums';
import { BusinessRuleException } from '../../../../common/exceptions/domain.exception';

export interface CreateTitleCommand {
  tenantId: string;
  userId: string;
  type: TitleType;
  description: string;
  amount: number;
  dueDate: Date;
  categoryId?: string;
  customerId?: string;
  supplierId?: string;
  origin?: TitleOrigin;
}

export interface CreateTitleResult {
  id: string;
  description?: string;
  amount: number;
  dueDate: Date;
  status: TitleStatus;
}

@Injectable()
export class CreateTitleUseCase {
  constructor(private readonly titleRepository: FinancialTitleRepository) {}

  async execute(command: CreateTitleCommand): Promise<CreateTitleResult> {
    this.validateAmount(command.amount);
    this.validateDueDate(command.dueDate);
    this.validateRequiredFields(command);

    const title = await this.titleRepository.create({
      tenantId: command.tenantId,
      type: command.type,
      origin: command.origin || TitleOrigin.MANUAL,
      description: command.description,
      originalAmount: command.amount,
      dueDate: command.dueDate,
      categoryId: command.categoryId,
      customerId: command.customerId,
      supplierId: command.supplierId,
      createdById: command.userId,
    });

    return {
      id: title.id,
      description: title.description,
      amount: title.originalAmount,
      dueDate: title.dueDate,
      status: title.status,
    };
  }

  private validateAmount(amount: number): void {
    if (amount <= 0) {
      throw new BusinessRuleException(
        'O valor do título deve ser maior que zero',
        'INVALID_AMOUNT',
      );
    }
  }

  private validateDueDate(dueDate: Date): void {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dueDateOnly = new Date(dueDate);
    dueDateOnly.setHours(0, 0, 0, 0);

    if (dueDateOnly < today) {
      throw new BusinessRuleException(
        'A data de vencimento não pode ser no passado',
        'INVALID_DUE_DATE',
      );
    }
  }

  private validateRequiredFields(command: CreateTitleCommand): void {
    if (!command.description?.trim()) {
      throw new BusinessRuleException(
        'A descrição é obrigatória',
        'MISSING_DESCRIPTION',
      );
    }
  }
}
