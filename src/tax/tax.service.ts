import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SearchTaxDto } from './dto/search-tax.dto';

@Injectable()
export class TaxService {
  constructor(private readonly prisma: PrismaService) {}

  async searchNcms(dto: SearchTaxDto) {
    const { search, limit } = dto;
    return this.prisma.ncm.findMany({
      where: search
        ? {
            OR: [
              { code: { contains: search, mode: 'insensitive' } },
              { description: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {},
      take: limit,
      orderBy: { code: 'asc' },
    });
  }

  async findAllCests(dto: SearchTaxDto) {
    return this.prisma.cest.findMany();
  }

  async findAllCfops(dto: SearchTaxDto) {
    return this.prisma.cfop.findMany();
  }

  async findNcmByCode(code: string) {
    return this.prisma.ncm.findUnique({ where: { code } });
  }

  async findCfopByCode(code: string) {
    return this.prisma.cfop.findUnique({ where: { code } });
  }

  async findCestByCode(code: string) {
    return this.prisma.cest.findUnique({ where: { code } });
  }
}
