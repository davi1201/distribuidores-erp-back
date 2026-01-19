import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import {
  CommissionStatus,
  CommissionType,
  CommissionScope,
} from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library'; // Importante para precisão
import { CreatePayoutDto } from './dto/create-payout.dto';

@Injectable()
export class CommissionsService {
  private readonly logger = new Logger(CommissionsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Ponto de entrada principal. Deve ser chamado quando um Order é criado.
   * Pode ser chamado via EventEmitter ou diretamente no OrderService.
   */
  async calculateAndRegister(orderId: string, tenantId: string) {
    this.logger.log(`Iniciando cálculo de comissão para Order: ${orderId}`);

    // 1. Buscar Pedido com Itens e Vendedor
    const order = await this.prisma.order.findUnique({
      where: { id: orderId, tenantId },
      include: {
        items: true,
        seller: true,
      },
    });

    if (!order) throw new NotFoundException('Pedido não encontrado.');
    if (!order.sellerId) {
      this.logger.warn(
        `Pedido ${orderId} sem vendedor vinculado. Comissão ignorada.`,
      );
      return;
    }

    // Inicializa variáveis com Decimal para precisão
    let totalRawCommission = new Decimal(0); // Comissão calculada item a item (antes do desconto global)
    let totalItemsNetValue = new Decimal(0); // Soma dos itens já descontando o desconto do item

    // 2. Iterar Itens e Calcular (Baseado no valor Líquido do Item)
    for (const item of order.items) {
      const quantity = new Decimal(item.quantity);
      const unitPrice = new Decimal(item.unitPrice);
      const itemDiscount = new Decimal(item.discount || 0); // Desconto específico do item

      // Valor Líquido do Item = (Preço * Qtd) - Desconto do Item
      // Nota: Se 'item.discount' for unitário, multiplique por quantidade.
      // Assumindo aqui que item.discount é o valor total de desconto da linha.
      const itemGross = unitPrice.mul(quantity);
      const itemNet = itemGross.sub(itemDiscount);

      // Proteção contra valor negativo
      const finalItemBase = itemNet.isNegative() ? new Decimal(0) : itemNet;

      // Busca a regra
      const rule = await this.resolveRule(
        tenantId,
        order.sellerId,
        item.productId,
      );

      if (rule) {
        // Calcula a comissão sobre o valor LÍQUIDO do item
        const commissionValue = this.calculateRuleValue(
          rule,
          finalItemBase,
          Number(item.quantity),
        );
        totalRawCommission = totalRawCommission.add(commissionValue);
      }

      totalItemsNetValue = totalItemsNetValue.add(finalItemBase);
    }

    // 3. Aplicação do Desconto Global (Rateio)
    // Se houver um desconto no cabeçalho do pedido (Cupom), reduzimos a comissão proporcionalmente.

    const orderGlobalDiscount = new Decimal(order.discount || 0);
    let finalBaseValue = totalItemsNetValue;
    let finalCommission = totalRawCommission;

    if (orderGlobalDiscount.gt(0) && totalItemsNetValue.gt(0)) {
      // Subtrai o desconto global do total dos itens
      finalBaseValue = totalItemsNetValue.sub(orderGlobalDiscount);

      // Se o desconto for maior que o valor total, base e comissão viram zero
      if (finalBaseValue.isNegative()) {
        finalBaseValue = new Decimal(0);
        finalCommission = new Decimal(0);
      } else {
        // Fator de Correção = (Valor Final / Valor dos Itens)
        // Ex: Vendeu 100, Desconto 10. Fator = 90 / 100 = 0.9
        const discountFactor = finalBaseValue.div(totalItemsNetValue);

        // Aplica o fator na comissão total
        finalCommission = totalRawCommission.mul(discountFactor);
      }
    }

    // 4. Calcular Taxa Efetiva (Para auditoria)
    const effectivePercentage = finalBaseValue.isZero()
      ? new Decimal(0)
      : finalCommission.div(finalBaseValue).mul(100);

    // 5. Persistir o Registro
    const record = await this.prisma.commissionRecord.upsert({
      where: { orderId: order.id },
      update: {
        commissionAmount: finalCommission,
        calculationBase: finalBaseValue,
        appliedPercentage: effectivePercentage,
      },
      create: {
        tenantId,
        sellerId: order.sellerId,
        orderId: order.id,
        status: 'PENDING', // Use seu Enum aqui
        calculationBase: finalBaseValue,
        appliedPercentage: effectivePercentage,
        commissionAmount: finalCommission,
        referenceDate: order.createdAt,
        dueDate: new Date(new Date().setDate(new Date().getDate() + 30)),
      },
    });

    this.logger.log(
      `Comissão registrada: R$ ${finalCommission.toFixed(2)} (Base: ${finalBaseValue.toFixed(2)}) para Seller ${order.sellerId}`,
    );
    return record;
  }

  /**
   * Lógica de Hierarquia Enterprise:
   * 1. Regra de Produto (Específica)
   * 2. Regra de Vendedor (Específica)
   * 3. Regra Global (Padrão)
   */
  private async resolveRule(
    tenantId: string,
    sellerId: string,
    productId: string,
  ) {
    // Busca todas as regras ativas que podem se aplicar
    const rules = await this.prisma.commissionRule.findMany({
      where: {
        tenantId,
        isActive: true,
        OR: [
          { scope: CommissionScope.PRODUCT, specificProductId: productId },
          { scope: CommissionScope.SELLER, specificUserId: sellerId },
          { scope: CommissionScope.GLOBAL },
        ],
      },
      orderBy: {
        // Ordem de prioridade (truque usando updated_at ou criar um campo 'priority' no banco)
        // Aqui faremos a lógica no código para ser mais explícito
        createdAt: 'desc',
      },
    });

    // Filtra na memória pela prioridade exata
    const productRule = rules.find((r) => r.scope === CommissionScope.PRODUCT);
    if (productRule) return productRule;

    const sellerRule = rules.find((r) => r.scope === CommissionScope.SELLER);
    if (sellerRule) return sellerRule;

    const globalRule = rules.find((r) => r.scope === CommissionScope.GLOBAL);
    return globalRule; // Pode ser null se não tiver regra nenhuma
  }

  /**
   * Aplica a matemática baseada no tipo da regra
   */
  private calculateRuleValue(
    rule: any,
    baseValue: Decimal,
    quantity: number,
  ): Decimal {
    let result = new Decimal(0);

    // 1. Porcentagem (Ex: 5% de R$ 100 = R$ 5)
    if (
      rule.type === CommissionType.PERCENTAGE ||
      rule.type === CommissionType.HYBRID
    ) {
      if (rule.percentage) {
        result = result.add(baseValue.mul(rule.percentage).div(100));
      }
    }

    // 2. Fixo (Ex: R$ 10 por item * 2 itens = R$ 20)
    if (
      rule.type === CommissionType.FIXED ||
      rule.type === CommissionType.HYBRID
    ) {
      if (rule.fixedValue) {
        result = result.add(new Decimal(rule.fixedValue).mul(quantity));
      }
    }

    return result;
  }

  // --- MÉTODOS PARA WEBHOOKS E FLUXO ---

  /**
   * Chamado quando o Webhook do Stripe confirma pagamento (invoice.payment_succeeded)
   */
  async approveCommission(ids: string[]) {
    return this.prisma.commissionRecord.updateMany({
      where: {
        id: { in: ids },
        status: CommissionStatus.PENDING,
      },
      data: { status: CommissionStatus.APPROVED },
    });
  }

  /**
   * Chamado quando há reembolso (charge.refunded)
   */
  async cancelCommission(orderId: string) {
    return this.prisma.commissionRecord.update({
      where: { orderId },
      data: { status: CommissionStatus.CANCELED },
    });
  }

  // --- MÉTODOS PARA DASHBOARD (Seller & Owner) ---

  /**
   * Retorna o resumo financeiro para o dashboard
   */
  async getSellerMetrics(tenantId: string, sellerId: string) {
    // Agrupa e soma por status
    const metrics = await this.prisma.commissionRecord.groupBy({
      by: ['status'],
      where: { tenantId, sellerId },
      _sum: {
        commissionAmount: true,
      },
    });

    const getSum = (status: CommissionStatus) =>
      metrics
        .find((m) => m.status === status)
        ?._sum.commissionAmount?.toNumber() || 0;

    return {
      pendingBalance: getSum(CommissionStatus.PENDING), // Futuro
      availableBalance: getSum(CommissionStatus.APPROVED), // Disponível para saque
      totalPaid: getSum(CommissionStatus.PAID), // Já recebido (Histórico)
      totalCanceled: getSum(CommissionStatus.CANCELED),
    };
  }

  /**
   * Retorna o extrato detalhado com paginação
   */
  async getStatement(tenantId: string, sellerId: string, page = 1) {
    return this.prisma.commissionRecord.findMany({
      where: { tenantId, sellerId },
      orderBy: { referenceDate: 'desc' },
      take: 20,
      skip: (page - 1) * 20,
      include: {
        order: {
          select: { code: true, customer: true }, // Mostra "Venda #123 - Cliente X"
        },
      },
    });
  }

  async createRule(tenantId: string, dto: any) {
    // Conversão de números para string/decimal se necessário, ou o Prisma lida com o DTO tipado
    return this.prisma.commissionRule.create({
      data: {
        tenantId,
        name: dto.name,
        scope: dto.scope,
        type: dto.type,
        percentage: dto.percentage, // Prisma converte number -> Decimal
        fixedValue: dto.fixedValue,
        specificUserId: dto.specificUserId,
        specificProductId: dto.specificProductId,
      },
    });
  }

  async listRules(tenantId: string) {
    return this.prisma.commissionRule.findMany({
      where: { tenantId, isActive: true },
      orderBy: { createdAt: 'desc' },
      include: {
        // Se quiser retornar o nome do produto/vendedor vinculado na regra
        // product: { select: { name: true } }
        // seller: { select: { name: true } }
      },
    });
  }
  async manualApprove(tenantId: string, commissionIds: string[]) {
    return this.prisma.commissionRecord.updateMany({
      where: {
        tenantId,
        id: { in: commissionIds },
        status: CommissionStatus.PENDING,
      },
      data: {
        status: CommissionStatus.APPROVED,
      },
    });
  }

  async createPayout(tenantId: string, dto: CreatePayoutDto) {
    const { sellerId, commissionIds, notes, receiptUrl } = dto;

    return this.prisma.$transaction(async (tx) => {
      // a) Calcula o total real selecionado (Segurança)
      const commissions = await tx.commissionRecord.findMany({
        where: {
          tenantId,
          id: { in: commissionIds },
          sellerId,
          status: CommissionStatus.APPROVED, // Só pode pagar o que já foi aprovado
        },
      });

      if (commissions.length === 0) {
        throw new BadRequestException(
          'Nenhuma comissão aprovada selecionada para pagamento.',
        );
      }

      // Soma usando Decimal para precisão
      const totalAmount = commissions.reduce(
        (acc, curr) => acc.add(curr.commissionAmount),
        new Decimal(0),
      );

      // b) Cria o Registro do Pagamento (O Histórico/Recibo)
      const payout = await tx.commissionPayout.create({
        data: {
          tenantId,
          sellerId,
          totalAmount,
          notes,
          receiptUrl, // Link do comprovante se tiver upload
          paidAt: new Date(), // Data do registro
        },
      });

      // c) Atualiza as comissões individuais para PAGO e vincula ao Payout
      await tx.commissionRecord.updateMany({
        where: { id: { in: commissions.map((c) => c.id) } },
        data: {
          status: CommissionStatus.PAID,
          paidAt: new Date(),
          payoutId: payout.id,
        },
      });

      return payout;
    });
  }

  async getPayoutsHistory(tenantId: string, sellerId?: string) {
    const where: any = { tenantId };
    if (sellerId) where.sellerId = sellerId;

    return this.prisma.commissionPayout.findMany({
      where,
      include: {
        seller: { select: { name: true, email: true } },
        _count: { select: { records: true } }, // Quantas vendas pagas neste lote
      },
      orderBy: { paidAt: 'desc' },
    });
  }

  // src/commissions/commissions.service.ts

  async getReadyToPay(tenantId: string) {
    // 1. Agrupa comissões aprovadas por vendedor (Query Leve)
    const groupedCommissions = await this.prisma.commissionRecord.groupBy({
      by: ['sellerId'],
      where: {
        tenantId,
        status: CommissionStatus.APPROVED,
      },
      _sum: { commissionAmount: true },
      _count: { id: true },
    });

    // 2. Enriquece os dados (Nome do Vendedor + Lista de IDs)
    // Usamos Promise.all para buscar os dados de todos os vendedores em paralelo
    const result = await Promise.all(
      groupedCommissions.map(async (group) => {
        // Busca dados do vendedor
        const seller = await this.prisma.user.findUnique({
          where: { id: group.sellerId },
          select: { name: true, email: true },
        });

        // Busca os IDs individuais (necessário para o payload de baixa)
        const records = await this.prisma.commissionRecord.findMany({
          where: {
            tenantId,
            sellerId: group.sellerId,
            status: CommissionStatus.APPROVED,
          },
          select: { id: true },
        });

        return {
          sellerId: group.sellerId,
          sellerName: seller?.name || 'Vendedor Desconhecido',
          sellerEmail: seller?.email,
          totalAmount: group._sum.commissionAmount,
          count: group._count.id,
          commissionIds: records.map((r) => r.id), // Lista pronta para ser enviada no createPayout
        };
      }),
    );

    return result;
  }

  async getCommissionsPendingApproval(tenantId: string) {
    return this.prisma.commissionRecord.findMany({
      where: {
        tenantId,
        status: CommissionStatus.PENDING,
      },
      orderBy: { referenceDate: 'asc' },
      include: {
        seller: { select: { name: true, email: true } },
        order: { select: { code: true, customer: true } },
      },
    });
  }
}
