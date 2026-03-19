import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role, PersonType } from '@prisma/client';
import { parse } from 'date-fns';
import { PrismaService } from '../prisma/prisma.service';
import { TenantsService } from '../tenants/tenants.service';
import { ERROR_MESSAGES, ENTITY_NAMES } from '../core/constants';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AddressInput {
  zipCode?: string;
  street?: string;
  number?: string;
  complement?: string;
  neighborhood?: string;
  city?: string | number;
  state?: string | number;
}

interface SocioInput {
  nome: string;
  cpf_cnpj?: string;
  qualificacao?: string;
  data_entrada?: string;
  faixa_etaria?: string;
  tipo?: string;
}

interface UpdateProfileInput {
  personType?: string;
  companyName?: string;
  document?: string;
  birthDate?: string;
  commercialEmail?: string;
  billingEmail?: string;
  commercialPhone?: string;
  commercialPhoneContact?: string;
  ownerName?: string;
  ownerDocument?: string;
  socios?: SocioInput[];
  address?: AddressInput;
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantsService: TenantsService,
  ) {}

  // ────────────────────────────────────────────────────────────────────────────
  // GET PROFILE
  // ────────────────────────────────────────────────────────────────────────────

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        tenant: {
          include: {
            plan: true,
            billingProfile: {
              include: { city: true, state: true, partners: true },
            },
            subscriptions: {
              where: { status: 'active' },
              orderBy: { currentPeriodEnd: 'desc' },
              take: 1,
            },
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException(ERROR_MESSAGES.NOT_FOUND(ENTITY_NAMES.USER));
    }

    const { tenant } = user;
    const activeSub = tenant?.subscriptions[0];
    const billing = tenant?.billingProfile;
    const plan = tenant?.plan;

    // ── Status da conta ──────────────────────────────────────────────────────
    let status = 'INACTIVE';
    let billingCycle: 'monthly' | 'yearly' | null = null;

    if (activeSub) {
      status = 'ACTIVE';
      if (activeSub.currentPeriodEnd && activeSub.currentPeriodStart) {
        const diffDays =
          Math.abs(
            new Date(activeSub.currentPeriodEnd).getTime() -
              new Date(activeSub.currentPeriodStart).getTime(),
          ) /
          (1000 * 60 * 60 * 24);
        billingCycle = diffDays > 35 ? 'yearly' : 'monthly';
      }
    } else if (
      tenant?.trialEndsAt &&
      new Date(tenant.trialEndsAt) > new Date()
    ) {
      status = 'TRIAL';
    }

    const { isComplete: isProfileComplete } =
      await this.tenantsService.checkBillingProfile(user.tenantId ?? '');

    // ── Retorno ──────────────────────────────────────────────────────────────
    return {
      // Usuário
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      avatarUrl: user.avatarUrl,
      permissions: user.permissions,

      // Tenant
      tenantId: user.tenantId,
      tenantName: tenant?.name,
      tenantSlug: tenant?.slug,
      onboardingUrl: tenant?.asaasOnboardingUrl,
      digitalAccountStatus: tenant?.asaasAccountStatus,

      // Plano
      planId: plan?.id,
      planSlug: plan?.slug,
      planName: plan?.name,
      planMaxUsers: plan?.maxUsers,

      // Assinatura
      status,
      billingCycle,
      isTrial: status === 'TRIAL',
      isTrialExpired:
        status === 'TRIAL' && tenant?.trialEndsAt
          ? new Date(tenant.trialEndsAt) < new Date()
          : false,
      trialEndsAt: tenant?.trialEndsAt,
      subscriptionEndsAt: activeSub?.currentPeriodEnd,

      // Perfil fiscal / billing
      isProfileComplete,
      personType: billing?.personType,
      companyName: billing?.tenantId ? tenant?.name : null,
      document: billing?.document,
      birthDate: billing?.birthDate,
      commercialEmail: billing?.commercialEmail,
      billingEmail: billing?.billingEmail,
      billingPhone: billing?.commercialPhone,
      commercialPhone: billing?.commercialPhone,
      commercialPhoneContact: billing?.commercialPhoneContact,
      ownerName: billing?.ownerName,
      ownerDocument: billing?.ownerDocument,
      socios: billing?.partners ?? [],

      // Endereço
      zipCode: billing?.zipCode,
      street: billing?.street,
      number: billing?.number,
      complement: billing?.complement,
      neighborhood: billing?.neighborhood,
      city: { id: billing?.city?.id, name: billing?.city?.name },
      state: { id: billing?.state?.id, uf: billing?.state?.uf },
    };
  }

  // ────────────────────────────────────────────────────────────────────────────
  // UPDATE PROFILE  (unifica updateProfile + updateCompanyProfile)
  // ────────────────────────────────────────────────────────────────────────────

  async updateProfile(userId: string, data: UpdateProfileInput) {
    // 1. Garante que o usuário e tenant existem
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, tenantId: true },
    });

    if (!user?.tenantId) {
      throw new NotFoundException(
        ERROR_MESSAGES.NOT_FOUND(ENTITY_NAMES.TENANT),
      );
    }

    // 2. Converte data de nascimento/fundação — aceita "DD/MM/YYYY"
    const parsedBirthDate = data.birthDate
      ? parse(data.birthDate, 'dd/MM/yyyy', new Date())
      : null;

    // 3. Resolve IDs de cidade e estado
    const { cityId, stateId } = await this.resolveAddressIds(data.address);

    // 4. Mapeia quadro societário
    const mappedPartners = this.mapPartners(data.socios);

    // 5. Monta payload de endereço
    const addressPayload = {
      zipCode: data.address?.zipCode?.replace(/\D/g, '') ?? '',
      street: data.address?.street ?? '',
      number: data.address?.number ?? '',
      complement: data.address?.complement ?? '',
      neighborhood: data.address?.neighborhood ?? '',
      cityId,
      stateId,
    };

    // 6. Upsert BillingProfile + atualiza nome do Tenant em transação
    await this.prisma.$transaction(async (tx) => {
      // Sincroniza nome do tenant com a razão social
      if (data.companyName) {
        await tx.tenant.update({
          where: { id: user.tenantId! },
          data: { name: data.companyName },
        });
      }

      await tx.billingProfile.upsert({
        where: { tenantId: user.tenantId! },
        create: {
          tenantId: user.tenantId!,
          personType: data.personType as PersonType | undefined,
          companyName: data.companyName,
          document: data.document?.replace(/\D/g, '') || '',
          birthDate: parsedBirthDate,
          commercialEmail: data.commercialEmail,
          billingEmail: data.billingEmail,
          commercialPhone: data.commercialPhone?.replace(/\D/g, ''),
          commercialPhoneContact: data.commercialPhoneContact,
          ownerName: data.ownerName,
          ownerDocument: data.ownerDocument?.replace(/\D/g, ''),
          ...addressPayload,
          partners: { create: mappedPartners },
        },
        update: {
          personType: data.personType as PersonType | undefined,
          companyName: data.companyName,
          document: data.document?.replace(/\D/g, ''),
          birthDate: parsedBirthDate,
          commercialEmail: data.commercialEmail,
          billingEmail: data.billingEmail,
          commercialPhone: data.commercialPhone?.replace(/\D/g, ''),
          commercialPhoneContact: data.commercialPhoneContact,
          ownerName: data.ownerName,
          ownerDocument: data.ownerDocument?.replace(/\D/g, ''),
          ...addressPayload,
          partners: {
            deleteMany: {},
            create: mappedPartners,
          },
        },
      });
    });

    return this.getProfile(userId);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // UPDATE PERMISSIONS
  // ────────────────────────────────────────────────────────────────────────────

  async updatePermissions(
    targetUserId: string,
    newPermissions: string[],
    currentUser: { tenantId: string },
  ) {
    const targetUser = await this.prisma.user.findUnique({
      where: { id: targetUserId },
    });

    if (!targetUser) {
      throw new NotFoundException(ERROR_MESSAGES.NOT_FOUND(ENTITY_NAMES.USER));
    }

    if (targetUser.tenantId !== currentUser.tenantId) {
      throw new ForbiddenException('Acesso negado.');
    }

    if (targetUser.role === Role.OWNER) {
      throw new ForbiddenException(
        'Não é possível alterar permissões do Proprietário.',
      );
    }

    return this.prisma.user.update({
      where: { id: targetUserId },
      data: { permissions: newPermissions },
      select: { id: true, name: true, permissions: true },
    });
  }

  // ────────────────────────────────────────────────────────────────────────────
  // GET SELLERS
  // ────────────────────────────────────────────────────────────────────────────

  async getAllSellers() {
    return this.prisma.user.findMany({
      where: { role: Role.SELLER },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    });
  }

  async getSellerByTenantId(tenantId: string) {
    return this.prisma.user.findMany({
      where: { tenantId, role: Role.SELLER },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    });
  }

  // ────────────────────────────────────────────────────────────────────────────
  // HELPERS PRIVADOS
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * Resolve cityId e stateId a partir do payload de endereço.
   *
   * - city: aceita código IBGE (7 dígitos, vindo do ViaCEP) ou ID interno
   * - state: aceita sigla ("PR", "SP" …) ou ID numérico
   */
  private async resolveAddressIds(address?: AddressInput) {
    let cityId: number | null = null;
    let stateId: number | null = null;

    if (address?.city) {
      const parsed = Number(address.city);

      if (!isNaN(parsed)) {
        // Tenta resolver pelo ibgeCode (código de 7 dígitos vindo do ViaCEP)
        const byIbge = await this.prisma.city.findFirst({
          where: { ibgeCode: String(parsed) },
          select: { id: true },
        });

        // Se encontrou pelo IBGE usa o ID interno; senão assume que já é ID interno
        cityId = byIbge?.id ?? parsed;
      }
    }

    if (address?.state) {
      const parsed = Number(address.state);

      if (!isNaN(parsed)) {
        // Já é um ID numérico
        stateId = parsed;
      } else {
        // É uma sigla — busca no banco pelo campo `uf`
        const record = await this.prisma.state.findFirst({
          where: { uf: String(address.state).toUpperCase() },
          select: { id: true },
        });
        stateId = record?.id ?? null;
      }
    }

    return { cityId, stateId };
  }

  /**
   * Mapeia o array de sócios do formato PT-BR do frontend
   * para o formato do modelo `Partner` do Prisma.
   */
  private mapPartners(socios?: SocioInput[]) {
    return (socios ?? []).map((s) => ({
      name: s.nome,
      document: s.cpf_cnpj?.replace(/\D/g, ''),
      qualification: s.qualificacao,
      entryDate: s.data_entrada ? new Date(s.data_entrada) : null,
      ageGroup: s.faixa_etaria,
      type: s.tipo,
    }));
  }
}
