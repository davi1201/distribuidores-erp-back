import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SystemService {
  constructor(private prisma: PrismaService) {}

  async getBaseMethods(tenantId: string) {
    // Busca todos os métodos globais do sistema
    const systemMethods = await this.prisma.systemPaymentMethod.findMany({
      orderBy: { name: 'asc' },
    });

    // Busca o que o lojista já configurou para mesclar e o frontend saber o que já está "Ligado"
    const tenantConfigs = await this.prisma.tenantPaymentMethod.findMany({
      where: { tenantId },
      include: { installments: true },
    });

    return systemMethods.map((sysMethod) => {
      // Procura se o lojista já tem uma configuração salva para este método base
      const config = tenantConfigs.find(
        (c) => c.systemPaymentMethodId === sysMethod.id,
      );

      return {
        systemMethodId: sysMethod.id,
        code: sysMethod.code,
        baseName: sysMethod.name,
        isAcquirer: sysMethod.isAcquirer,

        // Se a config existir, retorna os dados, senão retorna valores default (desligado)
        isConfigured: !!config,
        tenantConfigId: config?.id || null,
        customName: config?.customName || sysMethod.name,
        isActive: config?.isActive || false,
        discountPercentage: config ? Number(config.discountPercentage) : 0,
        maxInstallments: config?.maxInstallments || 1,
        minInstallmentValue: config ? Number(config.minInstallmentValue) : 0,
        passFeeToCustomer: config?.passFeeToCustomer || false,
        isAnticipated: config?.isAnticipated ?? true,
        installments:
          config?.installments.map((i) => ({
            installment: i.installment,
            feePercentage: Number(i.feePercentage),
            receiveInDays: i.receiveInDays,
          })) || [],
      };
    });
  }

  // ========================================================================
  // HEALTH CHECK E ONBOARDING
  // ========================================================================
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
