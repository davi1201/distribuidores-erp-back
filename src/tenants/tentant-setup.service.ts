import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { Prisma, User } from '@prisma/client';

@Injectable()
export class TenantSetupService {
  private readonly logger = new Logger(TenantSetupService.name);

  // Constantes de Configuração Inicial
  private readonly DEFAULT_PAYMENT_METHODS = [
    { name: 'Dinheiro', code: 'CASH' },
    { name: 'Pix', code: 'PIX' },
    { name: 'Boleto Bancário', code: 'BOLETO' },
    { name: 'Cartão de Crédito', code: 'CREDIT_CARD' },
    { name: 'Cartão de Débito', code: 'DEBIT_CARD' },
    { name: 'Transferência Bancária', code: 'BANK_TRANSFER' },
  ];

  // Exemplo: Categorias Financeiras Padrão (Bônus)
  private readonly DEFAULT_CATEGORIES = [
    { name: 'Vendas', type: 'INCOME' },
    { name: 'Despesas Gerais', type: 'EXPENSE' },
  ];

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Método principal que orquestra a criação ou importação de um Tenant
   * com todos os seus defaults (Warehouse, Payments, etc).
   */
  async setupTenant(params: {
    user: User;
    clerkOrgId: string;
    orgName: string;
    orgSlug?: string;
    isImport: boolean; // True = Já existe no Clerk, False = Criar Novo
  }) {
    const { user, clerkOrgId, orgName, orgSlug, isImport } = params;

    // 1. Garante que existe um plano (Safety Check)
    const planId = await this.getOrCreateDefaultPlan();

    // 2. Prepara dados do Tenant
    // Se for novo, damos 7 dias de trial. Se for import, assume ativo sem trial (ou ajuste conforme regra)
    const trialEndsAt = isImport ? null : new Date();
    if (trialEndsAt) trialEndsAt.setDate(trialEndsAt.getDate() + 7);

    // 3. Executa TUDO numa única transação
    return this.prisma.$transaction(async (tx) => {
      this.logger.log(
        `Iniciando setup do Tenant: ${orgName} (Import: ${isImport})`,
      );

      // A. Cria o Tenant
      const tenant = await tx.tenant.create({
        data: {
          name: orgName,
          slug: orgSlug || `tenant-${Date.now()}`,
          clerkId: clerkOrgId,
          planId: planId,
          isActive: true,
          trialEndsAt: trialEndsAt,
        },
      });

      // B. Cria o Warehouse Default
      await tx.warehouse.create({
        data: {
          name: 'Depósito Principal',
          tenantId: tenant.id,
          responsibleUserId: user.id,
          isDefault: true,
        },
      });

      // C. Cria Métodos de Pagamento
      if (this.DEFAULT_PAYMENT_METHODS.length > 0) {
        await tx.paymentMethod.createMany({
          data: this.DEFAULT_PAYMENT_METHODS.map((pm) => ({
            tenantId: tenant.id,
            name: pm.name,
            code: pm.code,
            isActive: true,
          })),
        });
      }

      // D. (Opcional) Cria Categorias Financeiras
      // await tx.financialCategory.createMany(...)

      this.logger.log(`Tenant ${tenant.name} configurado com sucesso!`);
      return tenant;
    });
  }

  /**
   * Helper para garantir que sempre temos um ID de plano válido
   */
  private async getOrCreateDefaultPlan(): Promise<string> {
    const plan = await this.prisma.plan.findFirst();
    if (plan) return plan.id;

    this.logger.warn('Nenhum plano encontrado. Criando plano de emergência...');
    const newPlan = await this.prisma.plan.create({
      data: {
        name: 'Basic Auto',
        slug: 'basic-auto',
        price: 0,
        isActive: true,
      },
    });
    return newPlan.id;
  }
}
