import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SystemService {
  constructor(private prisma: PrismaService) {}

  async checkSystemHealth(tenantId: string) {
    const [
      customerExists,
      productExists,
      priceTableExists,
      paymentConditionExists,
      supplierExists,
    ] = await Promise.all([
      this.prisma.customer.findFirst({
        where: { tenantId },
        select: { id: true },
      }),
      this.prisma.product.findFirst({
        where: { tenantId, isActive: true },
        select: { id: true },
      }),
      this.prisma.priceList.findFirst({
        where: { tenantId },
        select: { id: true },
      }),
      this.prisma.paymentTerm.findFirst({
        where: { tenantId },
        select: { id: true },
      }),
      this.prisma.supplier.findFirst({
        where: { tenantId },
        select: { id: true },
      }),
    ]);

    // O retorno é dinâmico, sempre 100% fiel à realidade do banco de dados naquele exato segundo
    return {
      hasCustomers: !!customerExists,
      hasProducts: !!productExists,
      hasPriceLists: !!priceTableExists,
      hasPaymentConditions: !!paymentConditionExists,
      hasSuppliers: !!supplierExists,

      // Bônus: Você pode até calcular a porcentagem geral de onboarding
      completionPercentage: this.calculatePercentage([
        !!customerExists,
        !!productExists,
        !!priceTableExists,
        !!paymentConditionExists,
      ]),
    };
  }

  private calculatePercentage(steps: boolean[]) {
    const completed = steps.filter(Boolean).length;
    return Math.round((completed / steps.length) * 100);
  }
}
