import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { CategoryDto } from './dto/category.dto';
import { Role, User } from '@prisma/client';
import { LocationsService } from 'src/locations/locations.service';

export interface FindCustomersFilters {
  name?: string;
  document?: string;
  state?: string;
  city?: string;
}

@Injectable()
export class CustomersService {
  constructor(
    private prisma: PrismaService,
    private locationsService: LocationsService,
  ) {}

  // ==================================================================
  // CUSTOMER OPERATIONS
  // ==================================================================

  async importBulk(data: any[], tenantId: string, currentUser: any) {
    const results = {
      success: 0,
      errors: [] as any[],
    };

    // Busca uma categoria de endereço padrão para usar na importação
    const defaultAddressCategoryId =
      await this.getDefaultAddressCategory(tenantId);

    for (const [index, row] of data.entries()) {
      try {
        // 1. Resolver Cidade (IBGE ou Nome/UF)
        let city: { id: number; stateCode: number } | null = null;
        // Se não veio código, mas veio nome e estado, busca no banco

        const foundCity = await this.locationsService.findCityForImport({
          ibgeCode: row.address_ibgeCode,
          cityName: row.address_city,
          stateUf: row.address_state,
        });

        if (!foundCity) {
          throw new BadRequestException(
            `Cidade não encontrada: ${row.address_city}/${row.address_state}`,
          );
        }

        city = { id: foundCity.id, stateCode: foundCity.stateId };

        // 2. Mapeamento (De Linha Excel -> Para DTO)
        const customerDto: CreateCustomerDto = {
          name: row.name,
          email: row.email,
          document: String(row.document).replace(/\D/g, ''), // Remove pontuação
          phone: row.phone ? String(row.phone) : undefined,
          // Normaliza PersonType (Aceita "JURIDICA", "PJ", "J")
          personType: row.personType,
          // Dados PJ
          corporateName: row.corporateName,
          tradeName: row.tradeName,
          stateRegistration: row.stateRegistration,
          municipalRegistration: row.municipalRegistration,

          // Booleanos (Trata "SIM", "TRUE", "1")
          isExempt: row.isExempt,
          isFinalConsumer: row.isFinalConsumer === 1 ? true : false,
          isICMSContributor: row.isICMSContributor === 1 ? true : false,

          // Vínculos
          sellerId: row.sellerId, // A função create vai validar se pode usar isso
          priceListId: row.priceListId,
          creditLimit: row.creditLimit ? Number(row.creditLimit) : 0,
          // Monta o endereço se houver dados
          addresses: city
            ? [
                {
                  zipCode: row.address_zipCode.replace(/\D/g, ''),
                  street: row.address_street,
                  number: row.address_number
                    ? String(row.address_number)
                    : 'S/N',
                  complement: row.address_complement,
                  city: city.id, // Código IBGE resolvido
                  state: city.stateCode, // Ex: PR
                  ibgeCode: row.address_ibgeCode,
                  neighborhood: row.address_district,
                  categoryId: defaultAddressCategoryId, // ID da categoria padrão
                },
              ]
            : [],

          contacts: [], // Implementar se a planilha tiver contatos
          attachments: [],
        };
        // 3. Reutiliza a lógica de criação existente
        await this.create(customerDto, tenantId, currentUser);

        results.success++;
      } catch (error) {
        console.log(error);

        // Registra o erro e continua para a próxima linha
        results.errors.push({
          row: index + 1,
          name: row.name || 'Desconhecido',
          error:
            error instanceof BadRequestException
              ? error.message
              : 'Erro interno ao processar linha',
        });
      }
    }

    return results;
  }

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
        sellerId: finalSellerId,
        tenantId,
        document: customerData.document?.replace(/\D/g, '') || null,
        phone: customerData.phone?.replace(/\D/g, '') || null,
        categoryId: customerData.categoryId || null,
        priceListId: customerData.priceListId || null,

        contacts: {
          create: contacts,
        },
        addresses: {
          create:
            addresses?.map((addr) => ({
              zipCode: addr.zipCode,
              street: addr.street,
              number: addr.number,
              complement: addr.complement,
              neighborhood: addr.neighborhood,
              ibgeCode: String(addr.ibgeCode),

              // 👇 Ajustado para ler addr.city
              city: addr.city
                ? { connect: { id: Number(addr.city) } }
                : undefined,

              // 👇 Ajustado para ler addr.state
              state: addr.state
                ? { connect: { id: Number(addr.state) } }
                : undefined,

              category: addr.categoryId
                ? { connect: { id: addr.categoryId } }
                : undefined,
            })) || [],
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

  async findAll(
    tenantId: string,
    currentUser: any,
    filters?: FindCustomersFilters, // Recebe os filtros opcionalmente
  ) {
    const whereCondition: any = { tenantId };

    if (currentUser.role === Role.SELLER) {
      whereCondition.sellerId = currentUser.userId;
    }

    // 1. Filtro por Nome (busca parcial e ignora maiúsculas/minúsculas)
    // Busca tanto no nome principal quanto no nome fantasia (se houver)
    if (filters?.name) {
      whereCondition.OR = [
        { name: { contains: filters.name, mode: 'insensitive' } },
        { tradeName: { contains: filters.name, mode: 'insensitive' } },
      ];
    }

    // 2. Filtro por Documento (CPF/CNPJ)
    if (filters?.document) {
      whereCondition.document = {
        contains: filters.document,
      };
    }

    // 3. Filtro por Estado e Cidade
    // Como um cliente tem vários 'addresses', usamos o operador 'some'
    // Isso traz o cliente se pelo menos UM endereço dele bater com o estado/cidade
    if (filters?.state || filters?.city) {
      whereCondition.addresses = {
        some: {
          // Converte para Number, já que no erro anterior vimos que a sua API retorna os IDs como números
          ...(filters.state && { stateId: Number(filters.state) }),
          ...(filters.city && { cityId: Number(filters.city) }),
        },
      };
    }

    return this.prisma.customer.findMany({
      where: whereCondition,
      orderBy: { name: 'asc' },
      include: {
        seller: { select: { name: true } },
        category: true,
        priceList: true,
        addresses: { include: { category: true, city: true, state: true } },
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

  private async getDefaultAddressCategory(tenantId: string): Promise<string> {
    const category = await this.prisma.addressCategory.findFirst({
      where: { tenantId },
      orderBy: { isSystemDefault: 'desc' }, // Prioriza a padrão do sistema
    });

    if (category) return category.id;

    // Se não existir nenhuma, cria uma "Padrão" automaticamente
    const newCategory = await this.prisma.addressCategory.create({
      data: {
        description: 'Principal',
        isSystemDefault: true,
        tenantId,
      },
    });
    return newCategory.id;
  }
}
