import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantsService } from '../tenants/tenants.service';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantsService: TenantsService,
  ) {}

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        tenant: {
          include: {
            plan: true,
            billingProfile: true,
            subscriptions: {
              where: { status: { in: ['ACTIVE'] } },
              orderBy: { currentPeriodEnd: 'desc' },
              take: 1,
            },
          },
        },
      },
    });

    if (!user) throw new NotFoundException('Usuário não encontrado.');

    const tenant = user.tenant || null;
    const activeSub = tenant?.subscriptions[0];
    const trialEndsAt = tenant?.trialEndsAt;
    const billingProfile = tenant?.billingProfile;

    let status = 'INACTIVE';
    let billingCycle: 'monthly' | 'yearly' | null = null;

    if (activeSub) {
      status = 'ACTIVE';
      if (activeSub.currentPeriodEnd && activeSub.currentPeriodStart) {
        const periodDiff = Math.abs(
          new Date(activeSub.currentPeriodEnd).getTime() -
            new Date(activeSub.currentPeriodStart).getTime(),
        );
        const daysDiff = periodDiff / (1000 * 60 * 60 * 24);
        billingCycle = daysDiff > 35 ? 'yearly' : 'monthly';
      }
    } else if (trialEndsAt && new Date(trialEndsAt) > new Date()) {
      status = 'TRIAL';
    }

    const isProfileCompleteRes = await this.tenantsService.checkBillingProfile(
      user.tenantId || '',
    );

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      avatarUrl: user.avatarUrl,

      tenantId: user.tenantId,
      tenantName: tenant?.name,
      tenantSlug: tenant?.slug,

      planSlug: tenant?.plan?.slug,
      planName: tenant?.plan?.name,
      planMaxUsers: 3,

      status,
      isTrial: status === 'TRIAL',
      isTrialExpired:
        status === 'TRIAL' && trialEndsAt
          ? new Date(trialEndsAt) < new Date()
          : false,
      trialEndsAt,
      subscriptionEndsAt: activeSub?.currentPeriodEnd,
      billingCycle,
      isProfileComplete: isProfileCompleteRes.isComplete,
      companyName: billingProfile?.tenantId ? tenant?.name : null,
      document: billingProfile?.document,
      personType: billingProfile?.personType,
      billingEmail: billingProfile?.email,
      billingPhone: billingProfile?.phone,
      zipCode: billingProfile?.zipCode,
      street: billingProfile?.street,
      number: billingProfile?.number,
      complement: billingProfile?.complement,
      neighborhood: billingProfile?.neighborhood,
      city: {
        name: billingProfile?.cityName,
        id: billingProfile?.cityId,
      },
      state: {
        uf: billingProfile?.stateUf,
        id: billingProfile?.stateId,
      },
    };
  }

  async updateProfile(
    userId: string,
    data: { name?: string; email?: string; phone?: string; avatarUrl?: string },
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('Usuário não encontrado.');

    if (data.email && data.email !== user.email) {
      const emailExists = await this.prisma.user.findUnique({
        where: { email: data.email },
      });
      if (emailExists) throw new BadRequestException('E-mail já está em uso.');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        name: data.name,
        email: data.email,
        phone: data.phone,
        avatarUrl: data.avatarUrl,
      },
    });

    return this.getProfile(userId);
  }

  async updateCompanyProfile(userId: string, data: any) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { tenantId: true },
    });

    const city = await this.prisma.city.findUnique({
      where: { id: parseInt(data.address.city) },
    });
    const state = await this.prisma.state.findUnique({
      where: { id: parseInt(data.address.state) },
    });

    if (data.cityId && !city)
      throw new NotFoundException('Cidade não encontrada.');

    if (data.stateId && !state)
      throw new NotFoundException('Estado não encontrado.');

    if (!user || !user.tenantId)
      throw new NotFoundException('Empresa não encontrada.');

    await this.prisma.$transaction(async (tx) => {
      if (data.companyName) {
        await tx.tenant.update({
          where: { id: user.tenantId || '' },
          data: { name: data.companyName },
        });
      }

      const billingData = {
        personType: data.personType,
        document: data.document,
        email: data.billingEmail,
        phone: data.billingPhone,
        zipCode: data.address.zipCode,
        street: data.address.street,
        number: data.address.number,
        complement: data.address.complement,
        neighborhood: data.address.neighborhood,
        cityName: city?.name,
        stateUf: state?.uf,
        cityId: city?.id,
        stateId: state?.id,
      };

      Object.keys(billingData).forEach(
        (key) => billingData[key] === undefined && delete billingData[key],
      );

      if (Object.keys(billingData).length > 0) {
        await tx.billingProfile.upsert({
          where: { tenantId: user.tenantId || '' },
          update: billingData,
          create: {
            ...billingData,
            tenantId: user.tenantId || '',
            document: data.document || '',
            email: data.billingEmail || '',
            phone: data.billingPhone || '',
            zipCode: data.address.zipCode || '',
            street: data.address.street || '',
            number: data.address.number || '',
            neighborhood: data.address.neighborhood || '',
            complement: data.address.complement || '',
            cityName: city?.name || '',
            stateUf: state?.uf || '',
          } as any,
        });
      }
    });

    return this.getProfile(userId);
  }

  async updatePermissions(
    targetUserId: string,
    newPermissions: string[],
    currentUser: any,
  ) {
    const targetUser = await this.prisma.user.findUnique({
      where: { id: targetUserId },
    });

    if (!targetUser) throw new NotFoundException('Usuário não encontrado');

    if (targetUser.tenantId !== currentUser.tenantId) {
      throw new ForbiddenException('Acesso negado');
    }

    if (targetUser.role === Role.OWNER) {
      throw new ForbiddenException(
        'Não é possível alterar permissões do Dono.',
      );
    }

    return this.prisma.user.update({
      where: { id: targetUserId },
      data: {
        permissions: newPermissions,
      },
      select: { id: true, name: true, permissions: true },
    });
  }

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
}
