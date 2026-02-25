import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { startOfMonth, subMonths, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Prisma } from '@prisma/client';

export interface DashboardFilterParams {
  tenantId: string;
  userId: string;
  role: string;
}

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  async getOverview({ tenantId, userId, role }: DashboardFilterParams) {
    const now = new Date();
    const startCurrentMonth = startOfMonth(now);
    const startLastMonth = startOfMonth(subMonths(now, 1));

    // Filtro base de segurança para Pedidos
    const orderBaseFilter: any = {
      tenantId,
      status: { not: 'CANCELED' },
    };

    if (role === 'SELLER') {
      orderBaseFilter.sellerId = userId;
    }

    // ========================================================================
    // 1. DADOS TOTAIS E AÇÕES PENDENTES (Consultas Paralelas)
    // ========================================================================
    const [
      totalSalesMonth,
      totalSalesLastMonth,
      activeCustomers,
      pendingSeparations,
      pendingTransfers,
      pendingCommissions,
    ] = await Promise.all([
      // Vendas do Mês Atual
      this.prisma.order.aggregate({
        where: { ...orderBaseFilter, createdAt: { gte: startCurrentMonth } },
        _sum: { total: true },
        _count: true,
      }),
      // Vendas do Mês Anterior (Para comparar o crescimento)
      this.prisma.order.aggregate({
        where: {
          ...orderBaseFilter,
          createdAt: { gte: startLastMonth, lt: startCurrentMonth },
        },
        _sum: { total: true },
      }),
      // Clientes Ativos
      this.prisma.customer.count({ where: { tenantId, isActive: true } }),

      // 👇 AÇÕES PENDENTES (NOVO) 👇
      // Pedidos parados aguardando separação da Matriz
      this.prisma.order.count({
        where: {
          tenantId,
          status: 'SEPARATION',
          ...(role === 'SELLER' ? { sellerId: userId } : {}),
        },
      }),
      // Transferências de estoque aguardando aprovação
      this.prisma.stockTransfer.count({
        where: {
          tenantId,
          status: 'PENDING',
          ...(role === 'SELLER' ? { requesterId: userId } : {}),
        },
      }),
      // Comissões geradas mas não aprovadas
      this.prisma.commissionRecord.aggregate({
        where: {
          order: {
            tenantId,
            ...(role === 'SELLER' ? { sellerId: userId } : {}),
          },
          status: 'PENDING',
        },
        _sum: { commissionAmount: true },
      }),
    ]);

    // ========================================================================
    // 2. RECEBIMENTOS POR MÉTODO DE PAGAMENTO (NOVO)
    // ========================================================================
    const financialTitles = await this.prisma.financialTitle.findMany({
      where: {
        tenantId,
        type: 'RECEIVABLE', // Filtra apenas contas a receber/vendas
        createdAt: { gte: startCurrentMonth },
        ...(role === 'SELLER' ? { userId } : {}), // Filtra pelo vendedor, se aplicável
      },
      include: { paymentMethod: { select: { name: true } } },
    });

    const paymentMethodsMap = new Map<string, number>();
    for (const title of financialTitles) {
      const methodName = title.paymentMethod?.name || 'Não Informado';
      paymentMethodsMap.set(
        methodName,
        (paymentMethodsMap.get(methodName) || 0) + Number(title.balance),
      );
    }
    const financialByMethod = Array.from(paymentMethodsMap.entries())
      .map(([method, total]) => ({ method, total }))
      .sort((a, b) => b.total - a.total); // Ordena do maior pro menor

    // ========================================================================
    // 3. PRODUTOS / CATEGORIAS MAIS VENDIDAS (NOVO)
    // ========================================================================
    const orderItems = await this.prisma.orderItem.findMany({
      where: {
        order: {
          ...orderBaseFilter,
          createdAt: { gte: startCurrentMonth },
        },
      },
      include: {
        product: { select: { name: true } },
        // Se no futuro você adicionar uma tabela Category, mude para:
        // product: { include: { category: true } } e agrupe pelo category.name
      },
    });

    const categoryMap = new Map<string, { total: number; quantity: number }>();

    for (const item of orderItems) {
      const catName = item.product?.name || 'Diversos';
      const existing = categoryMap.get(catName) || { total: 0, quantity: 0 };

      categoryMap.set(catName, {
        total: existing.total + Number(item.totalPrice),
        quantity: existing.quantity + Number(item.quantity), // 💡 AGORA SOMA A QUANTIDADE
      });
    }

    // Pega os top 5 produtos/categorias mais vendidos
    const salesByCategory = Array.from(categoryMap.entries())
      .map(([category, data]) => ({
        category,
        total: data.total,
        quantity: data.quantity,
      })) // 💡 RETORNA A QUANTIDADE
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);

    // ========================================================================
    // 4. GRÁFICOS E ÚLTIMAS VENDAS
    // ========================================================================
    const salesGraph = await this.getSalesGraphData({ tenantId, userId, role });

    const recentSales = await this.prisma.order.findMany({
      where: orderBaseFilter,
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: { customer: { select: { name: true } } },
    });

    // Cálculos Finais
    const currentTotal = Number(totalSalesMonth._sum.total || 0);
    const lastTotal = Number(totalSalesLastMonth._sum.total || 0);
    const growth =
      lastTotal > 0 ? ((currentTotal - lastTotal) / lastTotal) * 100 : 0;

    return {
      stats: {
        revenue: currentTotal,
        ordersCount: totalSalesMonth._count,
        customers: activeCustomers,
        growth: Math.round(growth),
      },
      // 👇 Novas Métricas de Alerta (Badges/Notificações)
      pendingActions: {
        separations: pendingSeparations,
        stockTransfers: pendingTransfers,
        pendingCommissionsAmount: Number(
          pendingCommissions._sum.commissionAmount || 0,
        ),
      },
      // 👇 Novas Métricas Analíticas
      financialByMethod,
      salesByCategory,

      salesChart: salesGraph,
      recentSales: recentSales.map((sale) => ({
        id: sale.id,
        customer: sale.customer.name,
        amount: Number(sale.total),
        status: sale.status,
        date: sale.createdAt,
      })),
    };
  }

  // Gráfico de Barras mantido sem alterações (O raw SQL aqui é mais performático para agrupamento por data)
  private async getSalesGraphData({
    tenantId,
    userId,
    role,
  }: DashboardFilterParams) {
    const currentDate = new Date();
    const startDate = subMonths(currentDate, 5);

    const userFilter =
      role === 'SELLER' ? Prisma.sql`AND "sellerId" = ${userId}` : Prisma.empty;

    const salesByMonth = await this.prisma.$queryRaw<
      Array<{ month_date: Date; total_sales: number }>
    >`
    SELECT 
      DATE_TRUNC('month', "createdAt") as month_date, 
      SUM(total) as total_sales
    FROM "orders"
    WHERE "tenantId" = ${tenantId}
      AND "createdAt" >= ${startDate}
      AND status != 'CANCELED'
      ${userFilter} 
    GROUP BY DATE_TRUNC('month', "createdAt")
    ORDER BY month_date ASC;
  `;

    return Array.from({ length: 4 }).map((_, index) => {
      const date = subMonths(currentDate, 3 - index);
      const monthName = format(date, 'MMM', { locale: ptBR });

      const dbRecord = salesByMonth.find(
        (s) =>
          s.month_date.getUTCMonth() === date.getMonth() &&
          s.month_date.getUTCFullYear() === date.getFullYear(),
      );

      return {
        date: monthName.charAt(0).toUpperCase() + monthName.slice(1),
        value: dbRecord ? Number(dbRecord.total_sales) : 0,
      };
    });
  }
}
