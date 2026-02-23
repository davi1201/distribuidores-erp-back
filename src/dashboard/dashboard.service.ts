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

    const orderBaseFilter: any = {
      tenantId,
      status: { not: 'CANCELED' },
    };

    if (role === 'SELLER') {
      // CORREÇÃO 1: Usando 'sellerId' ao invés de 'userId' para bater com o Prisma
      orderBaseFilter.sellerId = userId;
    }

    const [
      totalSalesMonth,
      totalSalesLastMonth,
      activeCustomers,
      lowStockCount,
    ] = await Promise.all([
      this.prisma.order.aggregate({
        where: {
          ...orderBaseFilter,
          createdAt: { gte: startCurrentMonth },
        },
        _sum: { total: true },
        _count: true,
      }),
      this.prisma.order.aggregate({
        where: {
          ...orderBaseFilter,
          createdAt: { gte: startLastMonth, lt: startCurrentMonth },
        },
        _sum: { total: true },
      }),
      this.prisma.customer.count({ where: { tenantId, isActive: true } }),
      this.prisma.product.count({ where: { tenantId, isActive: true } }),
    ]);

    const salesGraph = await this.getSalesGraphData({ tenantId, userId, role });

    const recentSales = await this.prisma.order.findMany({
      where: orderBaseFilter,
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: { customer: { select: { name: true } } },
    });

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

  private async getSalesGraphData({
    tenantId,
    userId,
    role,
  }: DashboardFilterParams) {
    const currentDate = new Date();
    const startDate = subMonths(currentDate, 5);

    // CORREÇÃO 2: Alterado "userId" para "sellerId" no SQL nativo
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
