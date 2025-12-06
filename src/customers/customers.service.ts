import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { CategoryDto } from './dto/category.dto';
import { Role, User } from '@prisma/client';

@Injectable()
export class CustomersService {
  constructor(private prisma: PrismaService) {}

  // ==================================================================
  // CUSTOMER OPERATIONS
  // ==================================================================

  async create(
    createCustomerDto: CreateCustomerDto,
    tenantId: string,
    currentUser: any,
  ) {
    // 1. Verifica duplicidade de documento
    const docExists = await this.prisma.customer.findFirst({
      where: {
        document: createCustomerDto.document,
        tenantId: tenantId,
      },
    });

    if (docExists) {
      throw new BadRequestException('CPF/CNPJ já cadastrado neste cliente.');
    }

    // 2. Lógica de Atribuição do Vendedor (Seller)
    let finalSellerId: string | null = null;

    if (currentUser.role === Role.SELLER) {
      // REGRA: Se é Vendedor, o cliente é OBRIGATORIAMENTE dele.
      // Ignoramos qualquer coisa que o front tenha mandado no sellerId.
      finalSellerId = currentUser.userId;
    } else {
      // REGRA: Se é ADMIN, OWNER ou SUPER_ADMIN.
      // Respeita a escolha do front. Se vier vazio (""), vira null (Cliente da Empresa).
      finalSellerId = createCustomerDto.sellerId || null;
    }

    const { contacts, addresses, attachments, ...customerData } =
      createCustomerDto;

    return this.prisma.customer.create({
      data: {
        ...customerData,
        sellerId: finalSellerId, // Usa o ID calculado acima
        tenantId,

        categoryId: customerData.categoryId || null,
        priceListId: customerData.priceListId || null,

        contacts: {
          create: contacts,
        },
        addresses: {
          create: addresses?.map((addr) => ({ ...addr })),
        },
        attachments: {
          create: attachments || [],
        },
      },
      include: {
        contacts: true,
        addresses: { include: { category: true } },
        attachments: true,
      },
    });
  }

  async findAll(tenantId: string, currentUser: any) {
    const whereCondition: any = { tenantId };

    if (currentUser.role === Role.SELLER) {
      whereCondition.sellerId = currentUser.userId;
    }

    return this.prisma.customer.findMany({
      where: whereCondition,
      orderBy: { name: 'asc' },
      include: {
        seller: { select: { name: true } },
        category: true,
        priceList: true,
        addresses: { include: { category: true } },
        attachments: true,
        contacts: true,
      },
    });
  }

  async findOne(id: string, tenantId: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
      include: { contacts: true, addresses: true, attachments: true },
    });

    if (!customer || customer.tenantId !== tenantId) {
      throw new NotFoundException('Cliente não encontrado');
    }
    return customer;
  }

  async update(
    id: string,
    updateDto: UpdateCustomerDto,
    tenantId: string,
    currentUser: User,
  ) {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
    });

    if (!customer || customer.tenantId !== tenantId) {
      throw new NotFoundException('Cliente não encontrado');
    }

    // Separa os relacionamentos do resto dos dados
    const { contacts, addresses, attachments, ...customerData } = updateDto;

    // Sanitização de dados (Vazio vira Null)
    const dataToUpdate: any = {
      ...customerData,
      sellerId: customerData.sellerId || null,
      priceListId: customerData.priceListId || null,
      categoryId: customerData.categoryId || null,
    };

    // Lógica de Segurança para Vendedor
    if (currentUser.role === 'SELLER') {
      delete dataToUpdate.sellerId;
    }

    return this.prisma.customer.update({
      where: { id },
      data: {
        ...dataToUpdate,

        // ATUALIZAÇÃO DOS CONTATOS
        contacts: {
          deleteMany: {},
          create: contacts?.map((c) => ({
            name: c.name,
            phone: c.phone,
            role: c.role,
          })),
        },

        // ATUALIZAÇÃO DOS ENDEREÇOS
        addresses: {
          deleteMany: {},
          create: addresses?.map((a) => ({
            zipCode: a.zipCode,
            street: a.street,
            number: a.number,
            complement: a.complement,
            neighborhood: a.neighborhood,
            city: a.city,
            state: a.state,
            categoryId: a.categoryId,
          })),
        },

        // ATUALIZAÇÃO DOS ANEXOS (AQUI ESTAVA O PROBLEMA)
        attachments: {
          deleteMany: {}, // 1. Apaga os antigos
          create:
            attachments?.map((att) => ({
              // 2. Cria os novos
              name: att.name,
              url: att.url,
              tenantId,
            })) || [],
        },
      },
    });
  }

  async remove(id: string, tenantId: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
    });

    if (!customer || customer.tenantId !== tenantId) {
      throw new NotFoundException('Cliente não encontrado');
    }

    return this.prisma.customer.delete({
      where: { id },
    });
  }

  // ==================================================================
  // CUSTOMER CATEGORY OPERATIONS
  // ==================================================================

  async getCustomerCategories(tenantId: string) {
    return this.prisma.customerCategory.findMany({
      where: { tenantId },
      orderBy: { description: 'asc' },
    });
  }

  async createCustomerCategory(categoryDto: CategoryDto, tenantId: string) {
    return this.prisma.customerCategory.create({
      data: { ...categoryDto, tenantId },
    });
  }

  async updateCustomerCategory(
    id: string,
    categoryDto: CategoryDto,
    tenantId: string,
  ) {
    const category = await this.prisma.customerCategory.findUnique({
      where: { id },
    });

    if (!category || category.tenantId !== tenantId) {
      throw new NotFoundException('Categoria de cliente não encontrada');
    }

    return this.prisma.customerCategory.update({
      where: { id },
      data: categoryDto,
    });
  }

  async deleteCustomerCategory(id: string, tenantId: string) {
    const category = await this.prisma.customerCategory.findUnique({
      where: { id },
    });

    if (!category || category.tenantId !== tenantId) {
      throw new NotFoundException('Categoria não encontrada');
    }

    return this.prisma.customerCategory.delete({ where: { id, tenantId } });
  }

  // ==================================================================
  // ADDRESS CATEGORY OPERATIONS
  // ==================================================================

  async getAddressCategories(tenantId: string) {
    return this.prisma.addressCategory.findMany({
      where: { tenantId },
      orderBy: { description: 'asc' },
    });
  }

  async createAddressCategory(categoryDto: CategoryDto, tenantId: string) {
    return this.prisma.addressCategory.create({
      data: { ...categoryDto, tenantId },
    });
  }

  async updateAddressCategory(
    id: string,
    categoryDto: CategoryDto,
    tenantId: string,
  ) {
    const category = await this.prisma.addressCategory.findUnique({
      where: { id },
    });

    if (!category || category.tenantId !== tenantId) {
      throw new NotFoundException('Categoria de endereço não encontrada');
    }

    return this.prisma.addressCategory.update({
      where: { id },
      data: categoryDto,
    });
  }

  async deleteAddressCategory(id: string, tenantId: string) {
    const category = await this.prisma.addressCategory.findUnique({
      where: { id },
    });

    if (!category || category.tenantId !== tenantId) {
      throw new NotFoundException('Categoria não encontrada');
    }

    if (category.isSystemDefault) {
      throw new BadRequestException(
        'A categoria padrão do sistema não pode ser excluída.',
      );
    }

    return this.prisma.addressCategory.delete({ where: { id, tenantId } });
  }
}
