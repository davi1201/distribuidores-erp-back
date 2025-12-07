import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTaxProfileDto } from './dto/create-tax-profile.dto';
import { UpdateTaxProfileDto } from './dto/update-tax-profile.dto';
import { User } from '@prisma/client';

@Injectable()
export class TaxProfilesService {
  constructor(private readonly prisma: PrismaService) {}

  // --- CREATE ---
  async create(createDto: CreateTaxProfileDto, tenantId: string) {
    const { rules, ...profileData } = createDto;

    return this.prisma.taxProfile.create({
      data: {
        ...profileData,
        tenantId,
        rules: {
          create: rules?.map((rule) => ({
            originState: rule.originState,
            destinationState: rule.destinationState,
            icmsRate: rule.icmsRate,
            ipiRate: rule.ipiRate,
            pisRate: rule.pisRate,
            cofinsRate: rule.cofinsRate,
          })),
        },
      },
      include: {
        rules: true,
      },
    });
  }

  // --- FIND ALL ---
  async findAll(tenantId: string) {
    return this.prisma.taxProfile.findMany({
      where: { tenantId },
      include: {
        rules: true,
        _count: { select: { products: true } }, // Para saber se está em uso
      },
      orderBy: { name: 'asc' },
    });
  }

  // --- FIND ONE ---
  async findOne(id: string, tenantId: string) {
    const profile = await this.prisma.taxProfile.findUnique({
      where: { id },
      include: { rules: true },
    });

    if (!profile || profile.tenantId !== tenantId) {
      throw new NotFoundException('Perfil tributário não encontrado.');
    }

    return profile;
  }

  // --- UPDATE ---
  async update(id: string, updateDto: UpdateTaxProfileDto, tenantId: string) {
    await this.findOne(id, tenantId); // Garante permissão

    const { rules, ...profileData } = updateDto;

    return this.prisma.$transaction(async (tx) => {
      // 1. Atualiza dados básicos do perfil
      await tx.taxProfile.update({
        where: { id },
        data: profileData,
      });

      // 2. Atualiza Regras (Estratégia: Delete All + Create New é mais segura para consistência de lista neste caso)
      // Como regras fiscais são simples value-objects dentro do perfil, recriar é aceitável.
      if (rules) {
        await tx.taxRule.deleteMany({
          where: { taxProfileId: id },
        });

        if (rules.length > 0) {
          await tx.taxRule.createMany({
            data: rules.map((r) => ({
              taxProfileId: id,
              originState: r.originState,
              destinationState: r.destinationState,
              icmsRate: r.icmsRate,
              ipiRate: r.ipiRate,
              pisRate: r.pisRate,
              cofinsRate: r.cofinsRate,
            })),
          });
        }
      }

      return this.findOne(id, tenantId);
    });
  }

  // --- REMOVE ---
  async remove(id: string, tenantId: string) {
    await this.findOne(id, tenantId); // Garante permissão

    // O Cascade do banco deve deletar as regras, mas podemos garantir aqui
    // Nota: Se houver produtos usando, o Prisma pode lançar erro de FK se não estiver configurado onDelete: SetNull no Produto

    // Verificação opcional de uso
    /*
    const usage = await this.prisma.product.count({ where: { taxProfileId: id } });
    if (usage > 0) throw new BadRequestException('Perfil em uso por produtos.');
    */

    return this.prisma.taxProfile.delete({
      where: { id },
    });
  }
}
