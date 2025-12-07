import { Injectable, NotFoundException } from '@nestjs/common';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PlansService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createPlanDto: CreatePlanDto) {
    return this.prisma.plan.create({
      data: createPlanDto,
    });
  }

  async findAll() {
    return this.prisma.plan.findMany({
      orderBy: {
        price: 'asc',
      },
    });
  }

  async findOne(id: string) {
    return this.prisma.plan.findUnique({
      where: { id },
    });
  }

  async findBySlug(slug: string) {
    return this.prisma.plan.findUnique({
      where: { slug },
    });
  }

  async update(id: string, updatePlanDto: UpdatePlanDto) {
    return this.prisma.plan.update({
      where: { id },
      data: updatePlanDto,
    });
  }

  async remove(id: string) {
    return this.prisma.plan.delete({
      where: { id },
    });
  }

  async toggleStatus(id: string) {
    const plan = await this.prisma.plan.findUnique({
      where: { id },
    });

    if (!plan) {
      throw new NotFoundException(`Plano com ID ${id} não encontrado.`);
    }

    return this.prisma.plan.update({
      where: { id },
      data: {
        isActive: !plan.isActive,
      },
    });
  }
}
