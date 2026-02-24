import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service'; // Ajuste o caminho
import {
  CreateCategoryDto,
  UpdateCategoryDto,
} from './dto/financial-category.dto';
import { CategoryType } from '@prisma/client';

@Injectable()
export class FinancialCategoryService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateCategoryDto, tenantId: string) {
    return this.prisma.financialCategory.create({
      data: {
        ...dto,
        tenantId,
      },
    });
  }

  async findAll(
    tenantId: string,
    type?: CategoryType,
    includeInactive = false,
  ) {
    return this.prisma.financialCategory.findMany({
      where: {
        tenantId,
        ...(type && { type }),
        ...(!includeInactive && { isActive: true }), // Por padrão, só lista as ativas
      },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string, tenantId: string) {
    const category = await this.prisma.financialCategory.findUnique({
      where: { id },
    });

    if (!category || category.tenantId !== tenantId) {
      throw new NotFoundException('Categoria não encontrada.');
    }

    return category;
  }

  async update(id: string, dto: UpdateCategoryDto, tenantId: string) {
    await this.findOne(id, tenantId); // Garante que existe e pertence ao tenant

    return this.prisma.financialCategory.update({
      where: { id },
      data: dto,
    });
  }

  // Soft Delete: Apenas desativa a categoria para não quebrar o histórico financeiro
  async remove(id: string, tenantId: string) {
    const category = await this.findOne(id, tenantId);

    // Verifica se a categoria está em uso antes de desativar (Opcional, mas recomendado)
    const titlesCount = await this.prisma.financialTitle.count({
      where: { categoryId: id },
    });

    if (titlesCount > 0) {
      // Se já foi usada, apenas inativamos para sumir dos Selects novos
      return this.prisma.financialCategory.update({
        where: { id },
        data: { isActive: false },
      });
    }

    // Se nunca foi usada em nenhum título, podemos excluir de verdade (Hard Delete) limpo
    return this.prisma.financialCategory.delete({
      where: { id },
    });
  }
}
