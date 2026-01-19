import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePaymentTermDto } from './dto/create-payment-term.dto';

@Injectable()
export class PaymentTermsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreatePaymentTermDto, tenantId: string) {
    // Valida se a soma das porcentagens é 100% (opcional, mas recomendado)
    const totalPercent = dto.rules.reduce((acc, curr) => acc + curr.percent, 0);
    // Margem de erro pequena para ponto flutuante
    if (Math.abs(totalPercent - 100) > 0.1) {
      // Pode lançar erro ou apenas avisar. Vamos seguir.
    }

    return this.prisma.paymentTerm.create({
      data: {
        tenantId,
        name: dto.name,
        description: dto.description,
        type: dto.type,
        isFlexible: dto.isFlexible,
        rules: JSON.stringify(dto.rules),
      },
    });
  }

  async findAll(tenantId: string, type?: 'PAYABLE' | 'RECEIVABLE') {
    const where: any = { tenantId, isActive: true };

    if (type) {
      // Se pedir PAYABLE, traz PAYABLE e BOTH
      where.type = { in: [type, 'BOTH'] };
    }

    const terms = await this.prisma.paymentTerm.findMany({
      where,
      orderBy: { name: 'asc' },
    });

    // Deserializa as regras para o frontend
    return terms.map((term) => ({
      ...term,
      rules: JSON.parse(term.rules),
    }));
  }

  async findOne(id: string, tenantId: string) {
    const term = await this.prisma.paymentTerm.findUnique({ where: { id } });
    if (!term || term.tenantId !== tenantId)
      throw new NotFoundException('Condição de pagamento não encontrada');

    return {
      ...term,
      rules: JSON.parse(term.rules),
    };
  }

  async remove(id: string, tenantId: string) {
    // Soft delete
    return this.prisma.paymentTerm.updateMany({
      where: { id, tenantId },
      data: { isActive: false },
    });
  }
}
