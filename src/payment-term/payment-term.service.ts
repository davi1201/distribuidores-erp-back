import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePaymentTermDto } from './dto/create-payment-term.dto';

// Core imports
import { ERROR_MESSAGES, ENTITY_NAMES } from '../core/constants';

@Injectable()
export class PaymentTermsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreatePaymentTermDto, tenantId: string) {
    // 1. Validar porcentagem (mantido)
    const totalPercent = dto.rules.reduce(
      (acc, curr) => acc + (curr.percent || 0),
      0,
    );
    if (Math.abs(totalPercent - 100) > 0.1) {
      throw new BadRequestException('A soma das parcelas deve ser 100%');
    }

    // 2. BUSCAR OS IDS REAIS DO TENANT
    // O Front-end envia IDs do sistema (globais). Precisamos dos IDs da tabela TenantPaymentMethod.
    const tenantMethods = await this.prisma.tenantPaymentMethod.findMany({
      where: {
        tenantId,
        systemPaymentMethodId: { in: dto.methodIds },
      },
      select: { id: true },
    });

    // Validação: Se o usuário selecionou métodos que ele ainda não configurou
    if (dto.methodIds?.length > 0 && tenantMethods.length === 0) {
      throw new BadRequestException(
        'Os métodos selecionados precisam ser configurados antes de serem vinculados a uma condição.',
      );
    }

    return this.prisma.paymentTerm.create({
      data: {
        tenantId,
        name: dto.name,
        description: dto.description,
        type: dto.type,
        isFlexible: dto.isFlexible,
        minAmount: dto.minAmount || 0,
        installmentsCount: dto.rules.length,
        // --- Desconto e Juros (Padrão ERP) ---
        discountPercentage: dto.discountPercentage || 0,
        discountDays: dto.discountDays || 0,
        interestPercentage: dto.interestPercentage || 0,
        finePercentage: dto.finePercentage || 0,
        instructions: dto.instructions,
        rules: dto.rules as any,
        allowedMethods: {
          connect: tenantMethods.map((m) => ({ id: m.id })),
        },
      },
      include: { allowedMethods: true },
    });
  }

  async findAll(tenantId: string, type?: 'PAYABLE' | 'RECEIVABLE') {
    const where: any = { tenantId, isActive: true };

    if (type) {
      // Padrão ERP: Se pedir RECEIVABLE, traz os específicos e os que servem para ambos (BOTH)
      where.type = { in: [type, 'BOTH'] };
    }

    return this.prisma.paymentTerm.findMany({
      where,
      include: {
        allowedMethods: {
          select: {
            id: true,
            customName: true,
            systemPaymentMethod: { select: { name: true, id: true } },
          },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string, tenantId: string) {
    const term = await this.prisma.paymentTerm.findUnique({
      where: { id },
      include: { allowedMethods: true },
    });

    if (!term || term.tenantId !== tenantId) {
      throw new NotFoundException(
        ERROR_MESSAGES.NOT_FOUND(ENTITY_NAMES.PAYMENT_TERM),
      );
    }

    return term; // ✅ Objeto limpo e tipado
  }

  async update(id: string, dto: any, tenantId: string) {
    // 1. Verificar e converter os IDs do Sistema para os IDs do Tenant
    let tenantMethodIds: string[] = [];

    if (dto.methodIds && dto.methodIds.length > 0) {
      // Busca os métodos do Tenant que correspondem aos IDs do sistema enviados
      const tenantMethods = await this.prisma.tenantPaymentMethod.findMany({
        where: {
          tenantId: tenantId,
          systemPaymentMethodId: {
            in: dto.methodIds,
          },
        },
        select: { id: true },
      });

      tenantMethodIds = tenantMethods.map((method) => method.id);
    }

    // 2. Realizar o update com os IDs corretos
    return this.prisma.paymentTerm.update({
      where: { id, tenantId },
      data: {
        name: dto.name,
        description: dto.description,
        type: dto.type,
        isActive: dto.isActive,
        isFlexible: dto.isFlexible,
        minAmount: dto.minAmount,

        // --- Desconto e Juros (Padrão ERP) ---
        discountPercentage: dto.discountPercentage,
        discountDays: dto.discountDays,
        interestPercentage: dto.interestPercentage,
        finePercentage: dto.finePercentage,

        instructions: dto.instructions,
        rules: dto.rules,
        installmentsCount: dto.rules?.length || dto.installmentsCount || 1,

        // Agora conectamos usando os IDs da tabela correta (TenantPaymentMethod)
        allowedMethods: {
          set: tenantMethodIds.map((methodId) => ({ id: methodId })),
        },
      },
    });
  }

  async remove(id: string, tenantId: string) {
    // Soft delete preservado conforme sua regra original
    return this.prisma.paymentTerm.updateMany({
      where: { id, tenantId },
      data: { isActive: false },
    });
  }
}
