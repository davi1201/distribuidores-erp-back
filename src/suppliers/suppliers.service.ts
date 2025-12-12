import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateSupplierDto,
  LinkProductSupplierDto,
} from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto'; // Crie usando PartialType

@Injectable()
export class SuppliersService {
  constructor(private readonly prisma: PrismaService) {}

  // --- CRUD BÁSICO ---

  async create(dto: CreateSupplierDto, tenantId: string) {
    const document = dto.document.replace(/\D/g, '');

    const exists = await this.prisma.supplier.findUnique({
      where: {
        tenantId_document: { tenantId, document },
      },
    });

    if (exists) {
      throw new BadRequestException(
        'Fornecedor já cadastrado com este CNPJ/CPF.',
      );
    }

    return this.prisma.supplier.create({
      data: {
        ...dto,
        document,
        tenantId,
      },
    });
  }

  async findAll(tenantId: string) {
    return this.prisma.supplier.findMany({
      where: { tenantId },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string, tenantId: string) {
    const supplier = await this.prisma.supplier.findUnique({
      where: { id },
      include: {
        productLinks: {
          include: { product: true }, // Mostra quais produtos ele fornece
        },
      },
    });

    if (!supplier || supplier.tenantId !== tenantId) {
      throw new NotFoundException('Fornecedor não encontrado.');
    }

    return supplier;
  }

  async update(id: string, dto: UpdateSupplierDto, tenantId: string) {
    await this.findOne(id, tenantId); // Garante existência

    // Se tiver documento, limpa
    const data = { ...dto };
    if (data.document) data.document = data.document.replace(/\D/g, '');

    return this.prisma.supplier.update({
      where: { id },
      data,
    });
  }

  async remove(id: string, tenantId: string) {
    await this.findOne(id, tenantId);
    return this.prisma.supplier.delete({ where: { id } });
  }

  // --- VÍNCULO PRODUTO X FORNECEDOR (O Diferencial do ERP) ---

  async linkProduct(dto: LinkProductSupplierDto, tenantId: string) {
    // 1. Valida existência
    const product = await this.prisma.product.findUnique({
      where: { id: dto.productId },
    });
    const supplier = await this.prisma.supplier.findUnique({
      where: { id: dto.supplierId },
    });

    if (
      !product ||
      product.tenantId !== tenantId ||
      !supplier ||
      supplier.tenantId !== tenantId
    ) {
      throw new NotFoundException('Produto ou Fornecedor inválidos.');
    }

    // 3. Upsert (Cria ou Atualiza o vínculo)
    return this.prisma.productSupplier.upsert({
      where: {
        productId: dto.productId,
        supplierId: dto.supplierId,
      },
      update: {
        supplierProductCode: dto.supplierProductCode,
        lastPrice: dto.lastPrice,
      },
      create: {
        tenantId,
        productId: dto.productId,
        supplierId: dto.supplierId,
        supplierProductCode: dto.supplierProductCode,
        lastPrice: dto.lastPrice || 0,
      },
    });
  }

  // Buscar fornecedores de um produto específico
  async getSuppliersByProduct(productId: string, tenantId: string) {
    return this.prisma.productSupplier.findMany({
      where: { productId, tenantId },
      include: { supplier: true },
    });
  }
}
