import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

interface CityResolveDto {
  ibgeCode?: string;
  cityName?: string;
  stateUf?: string; // Ex: 'PR', 'SP'
}

@Injectable()
export class LocationsService {
  constructor(private prisma: PrismaService) {}

  async findAllStates() {
    return this.prisma.state.findMany({
      orderBy: { name: 'asc' },
    });
  }

  async findCitiesByState(id: number) {
    return this.prisma.city.findMany({
      where: { state: { id } },
      orderBy: { name: 'asc' },
    });
  }

  async findCityForImport(dto: CityResolveDto) {
    const { ibgeCode, cityName, stateUf } = dto;
    console.log('ibgeCode', ibgeCode);

    // 1. Tentativa pelo Código IBGE (Mais preciso e rápido)
    if (ibgeCode) {
      // Remove pontuação se houver (ex: 41.09401 -> 4109401)
      const cleanIbge = String(ibgeCode).replace(/\D/g, '');

      const cityByIbge = await this.prisma.city.findFirst({
        where: { ibgeCode: cleanIbge },
      });

      if (cityByIbge) return cityByIbge;
    }

    // 2. Tentativa por Nome + UF (Fallback)
    if (cityName && stateUf) {
      const cleanCityName = cityName.trim();
      const cleanUf = stateUf.trim();

      const cityByName = await this.prisma.city.findFirst({
        where: {
          name: {
            equals: cleanCityName,
            mode: 'insensitive',
          },
          state: {
            uf: {
              equals: cleanUf,
              mode: 'insensitive',
            },
          },
        },
      });

      return cityByName;
    }

    // Se não achou nada
    return null;
  }
}
