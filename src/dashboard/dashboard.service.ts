import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { startOfMonth, subMonths, format } from 'date-fns';

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  async getOverview(tenantId: string) {
    const now = new Date();
    const startCurrentMonth = startOfMonth(now);
    const startLastMonth = startOfMonth(subMonths(now, 1));

    // 1. Totais Gerais (Cards)
    const [
      totalSalesMonth,
      totalSalesLastMonth,
      activeCustomers,
      lowStockCount,
    ] = await Promise.all([
      // Vendas Mês Atual
      this.prisma.order.aggregate({
        where: {
          tenantId,
          createdAt: { gte: startCurrentMonth },
          status: { not: 'CANCELED' },
        },
        _sum: { total: true },
        _count: true,
      }),
      // Vendas Mês Anterior (Para calcular % crescimento)
      this.prisma.order.aggregate({
        where: {
          tenantId,
          createdAt: { gte: startLastMonth, lt: startCurrentMonth },
          status: { not: 'CANCELED' },
        },
        _sum: { total: true },
      }),
      // Clientes Ativos
      this.prisma.customer.count({ where: { tenantId, isActive: true } }),
      // Estoque Baixo (Produtos onde quantidade <= minStock)
      // Nota: Essa query é complexa no Prisma sem raw query, simplificando para contagem total por enquanto
      this.prisma.product.count({ where: { tenantId, isActive: true } }),
    ]);

    // 2. Dados para Gráfico (Vendas últimos 7 dias ou 6 meses)
    // Aqui simularemos um agrupamento. O ideal é usar $queryRaw para performance.
    const salesGraph = await this.getSalesGraphData(tenantId);

    // 3. Últimas Vendas
    const recentSales = await this.prisma.order.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: { customer: { select: { name: true } } },
    });

    // Cálculo de Crescimento
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

  // Helper para dados do gráfico (Simulado/Básico)
  private async getSalesGraphData(tenantId: string) {
    // Em produção: Usar SQL Raw "GROUP BY date(createdAt)"
    // Exemplo simplificado:
    return [
      { date: 'Jan', value: 1200 },
      { date: 'Fev', value: 1900 },
      { date: 'Mar', value: 3000 },
      { date: 'Abr', value: 2500 },
      { date: 'Mai', value: 4200 },
      { date: 'Jun', value: 5000 },
    ];
  }
}
