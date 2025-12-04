import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { UpdateBillingProfileDto } from '../users/dto/update-billing-profile.dto';
import { User } from '@prisma/client';

@Injectable()
export class TenantsService {
  private readonly logger = new Logger(TenantsService.name);

  constructor(private prisma: PrismaService) {}

  async checkBillingProfile(tenantId: string) {
    const profile = await this.prisma.billingProfile.findUnique({
      where: { tenantId },
      select: {
        document: true,
        zipCode: true,
      },
    });

    const isComplete = !!profile?.document && !!profile?.zipCode;
    return { isComplete };
  }

  async updateBillingProfile(user: User, data: UpdateBillingProfileDto) {
    if (!user.tenantId) throw new NotFoundException('Tenant ID não informado');

    let stateConnectId: number | null = null;
    let cityConnectId: number | null = null;
    let finalStateUf = data.state;
    let finalCityName = data.city;

    if (data.state) {
      const isId = !isNaN(Number(data.state));
      const stateObj = await this.prisma.state.findUnique({
        where: isId
          ? { id: Number(data.state) }
          : { uf: data.state.toUpperCase() },
      });

      if (stateObj) {
        stateConnectId = stateObj.id;
        finalStateUf = stateObj.uf;
      }
    }

    if (data.ibgeCode) {
      const cityObj = await this.prisma.city.findUnique({
        where: { ibgeCode: data.ibgeCode },
        include: { state: true },
      });

      if (cityObj) {
        cityConnectId = cityObj.id;
        finalCityName = cityObj.name;
        stateConnectId = cityObj.stateId;
        finalStateUf = cityObj.state.uf;
      }
    } else if (stateConnectId && data.city) {
      const isId = !isNaN(Number(data.city));
      const cityObj = await this.prisma.city.findFirst({
        where: {
          stateId: stateConnectId,
          ...(isId
            ? { id: Number(data.city) }
            : { name: { equals: data.city, mode: 'insensitive' } }),
        },
      });

      if (cityObj) {
        cityConnectId = cityObj.id;
        finalCityName = cityObj.name;
      }
    }

    this.logger.log(
      `Atualizando BillingProfile do Tenant ${user.tenantId}. CityID: ${cityConnectId}, StateID: ${stateConnectId}`,
    );

    return this.prisma.billingProfile.create({
      data: {
        tenantId: user.tenantId,
        personType: data.personType,
        document: data.document.replace(/\D/g, ''),
        phone: data.phone.replace(/\D/g, ''),
        email: user.email,
        zipCode: data.zipCode,
        street: data.street,
        number: data.number,
        complement: data.complement,
        neighborhood: data.neighborhood,
        cityName: finalCityName,
        stateUf: finalStateUf,
        stateId: stateConnectId,
        cityId: cityConnectId,
      },
    });
  }
}
