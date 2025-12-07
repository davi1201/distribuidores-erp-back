import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePriceListDto } from './dto/create-price-list.dto';
import { UpdatePriceListDto } from './dto/update-price-list.dto'; // Crie extendendo o Create (PartialType)

@Injectable()
export class PriceListsService {
  constructor(private prisma: PrismaService) {}

  async create(createDto: CreatePriceListDto, tenantId: string) {
    return this.prisma.priceList.create({
      data: {
        ...createDto,
        tenantId,
      },
    });
  }

  async findAll(tenantId: string) {
    return this.prisma.priceList.findMany({
      where: { tenantId },
      orderBy: { name: 'asc' },
      include: {
        _count: {
          select: { customers: true }, // Útil para saber quantos clientes usam essa lista
        },
      },
    });
  }

  async findOne(id: string, tenantId: string) {
    const priceList = await this.prisma.priceList.findUnique({
      where: { id },
    });

    if (!priceList || priceList.tenantId !== tenantId) {
      throw new NotFoundException('Tabela de preço não encontrada');
    }

    return priceList;
  }

  async update(id: string, updateDto: UpdatePriceListDto, tenantId: string) {
    await this.findOne(id, tenantId); // Garante que existe e pertence ao tenant

    return this.prisma.priceList.update({
      where: { id },
      data: updateDto,
    });
  }

  async remove(id: string, tenantId: string) {
    await this.findOne(id, tenantId); // Garante que existe e pertence ao tenant

    // Opcional: Impedir deletar se tiver clientes vinculados

    const usage = await this.prisma.customer.count({
      where: { priceListId: id },
    });
    if (usage > 0)
      throw new BadRequestException('Não é possível excluir uma lista em uso.');

    return this.prisma.priceList.delete({
      where: { id },
    });
  }
}
