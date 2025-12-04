import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';

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
}
