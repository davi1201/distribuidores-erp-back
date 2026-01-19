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
    return this.prisma.$transaction(async (tx) => {
      // 1. Cria a Tabela de Preço
      const priceList = await tx.priceList.create({
        data: {
          ...createDto,
          tenantId,
        },
      });

      // 2. Busca todos os produtos ativos do Tenant
      const products = await tx.product.findMany({
        where: { tenantId, isActive: true },
        select: { id: true, costPrice: true, markup: true },
      });

      if (products.length > 0) {
        // 3. Prepara os dados para inserção em massa
        const adjustment = Number(createDto.percentageAdjustment) || 0;

        const pricesToCreate = products.map((product) => {
          const cost = Number(product.costPrice) || 0;
          const markup = Number(product.markup) || 0;

          const baseSellingPrice = cost * (1 + markup / 100);
          const finalPrice = baseSellingPrice * (1 + adjustment / 100);

          return {
            tenantId,
            productId: product.id,
            priceListId: priceList.id,
            price: Number(finalPrice.toFixed(2)), // Arredonda para 2 casas decimais
          };
        });

        // 4. Cria os preços em massa (Bulk Insert)
        await tx.productPrice.createMany({
          data: pricesToCreate,
        });
      }

      return priceList;
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
    const existingPriceList = await this.findOne(id, tenantId);

    return this.prisma.$transaction(async (tx) => {
      // 1. Atualiza os dados da lista (nome, ajuste, status, etc)
      const updatedPriceList = await tx.priceList.update({
        where: { id },
        data: updateDto,
      });

      // 2. Verifica se houve alteração no percentual de ajuste
      // Se houve, precisamos recalcular os preços de todos os produtos
      if (
        updateDto.percentageAdjustment !== undefined &&
        Number(updateDto.percentageAdjustment) !==
          Number(existingPriceList.percentageAdjustment)
      ) {
        // A. Busca produtos ativos para recalcular
        const products = await tx.product.findMany({
          where: { tenantId, isActive: true },
          select: { id: true, costPrice: true, markup: true },
        });

        if (products.length > 0) {
          // B. Remove os preços antigos (limpeza para recriação limpa)
          // Isso é mais performático que fazer update um a um
          await tx.productPrice.deleteMany({
            where: { priceListId: id },
          });

          // C. Prepara novos preços
          const adjustment = Number(updatedPriceList.percentageAdjustment) || 0;

          const pricesToCreate = products.map((product) => {
            const cost = Number(product.costPrice) || 0;
            const markup = Number(product.markup) || 0;

            // Preço Base = Custo + Markup do Produto
            const baseSellingPrice = cost * (1 + markup / 100);

            // Preço Final = Preço Base + Ajuste da Lista
            const finalPrice = baseSellingPrice * (1 + adjustment / 100);

            return {
              tenantId,
              productId: product.id,
              priceListId: id,
              price: Number(finalPrice.toFixed(2)),
            };
          });

          // D. Insere os novos preços em massa
          await tx.productPrice.createMany({
            data: pricesToCreate,
          });
        }
      }

      return updatedPriceList;
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
