import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { customAlphabet } from 'nanoid';
import { PrismaService } from 'src/prisma/prisma.service';
import {
  CreateProductDto,
  CreateProductBatchDto,
} from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { User } from '@prisma/client';
import { CalculatePriceDto } from './dto/calculate-price.dto';

const generateSku = customAlphabet('123456789ABCDEFGHJKLMNPQRSTUVWXYZ', 8);

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  // ===========================================================================
  // PUBLIC METHODS
  // ===========================================================================

  async createBatch(
    batchDto: CreateProductBatchDto,
    tenantId: string,
    user: any,
  ) {
    const { parentData, variants } = batchDto;

    if (!variants || variants.length === 0) {
      throw new BadRequestException('É necessário ao menos uma variante.');
    }

    return this.prisma.$transaction(async (tx) => {
      const warehouse = await this.getOrCreateDefaultWarehouse(tenantId, tx);
      let parentId: string | null = null;

      // 1. Cria o PAI (se houver dados)
      if (parentData) {
        const parentSku = parentData.sku || `GRP-${generateSku()}`;
        const parent = await tx.product.create({
          data: {
            tenantId,
            name: parentData.name,
            description: parentData.description || '',
            brand: parentData.brand || '',
            sku: parentSku.toUpperCase(),
            ncm: parentData.ncm,
            cest: parentData.cest || '',
            cfop: parentData.cfop || '',
            origin: Number(parentData.origin || 0),
            taxProfileId: parentData.taxProfileId || null,
            unit: 'UN',
            isActive: true,
            costPrice: 0,
            expenses: 0,
            markup: 0,
          },
        });
        parentId = parent.id;
      }

      // 2. Cria as Variantes reutilizando lógica centralizada
      const createdProducts: any[] = [];
      for (const variant of variants) {
        // const finalName = parentData
        //   ? `${parentData.name} ${variant.name}`
        //   : variant.name;

        // Prepara dados mesclando pai e filho
        const productData = {
          ...variant,
          name: variant.name,
          // variantName: parentData ? variant.name : null,
          brand: parentData?.brand || variant.brand,
          description: parentData?.description || variant.description,
          ncm: parentData?.ncm || variant.ncm,
          cest: parentData?.cest || variant.cest,
          cfop: parentData?.cfop || variant.cfop,
          origin: parentData?.origin ?? variant.origin,
          taxProfileId: parentData?.taxProfileId || variant.taxProfileId,
          parentId,
        };

        const product = await this.createSingleProductInternal(
          tx,
          productData,
          tenantId,
          user,
          warehouse.id,
        );
        createdProducts.push(product);
      }

      return {
        parentId,
        products: createdProducts,
        message: `${createdProducts.length} produto(s) criado(s) com sucesso`,
      };
    });
  }

  async create(createDto: CreateProductDto, tenantId: string, user: User) {
    return this.prisma.$transaction(async (tx) => {
      const warehouse = await this.getOrCreateDefaultWarehouse(tenantId, tx);

      return this.createSingleProductInternal(
        tx,
        createDto,
        tenantId,
        user,
        warehouse.id,
      );
    });
  }

  async updateBatch(
    parentId: string,
    batchDto: CreateProductBatchDto,
    tenantId: string,
    user: any,
  ) {
    const { parentData, variants } = batchDto;

    if (!variants || variants.length === 0) {
      throw new BadRequestException('É necessário ao menos uma variante.');
    }

    return this.prisma.$transaction(async (tx) => {
      const warehouse = await this.getOrCreateDefaultWarehouse(tenantId, tx);

      // Verifica PAI
      const existingParent = await tx.product.findUnique({
        where: { id: parentId },
        include: { variants: { select: { id: true } } },
      });

      if (!existingParent || existingParent.tenantId !== tenantId) {
        throw new NotFoundException('Produto não encontrado.');
      }

      // Atualiza PAI (Dados gerais)
      if (parentData && existingParent.variants.length > 0) {
        await tx.product.update({
          where: { id: parentId },
          data: {
            name: parentData.name,
            description: parentData.description || '',
            brand: parentData.brand || '',
            ncm: parentData.ncm,
            cest: parentData.cest || '',
            cfop: parentData.cfop || '',
            origin: Number(parentData.origin || 0),
            taxProfileId: parentData.taxProfileId || null,
          },
        });
      }

      const updatedProducts: any[] = [];

      // --- CORREÇÃO AQUI ---
      const existingVariantIds = new Set(
        existingParent.variants.map((v) => v.id),
      );
      // Adiciona o próprio Pai na lista de IDs válidos para Update
      existingVariantIds.add(parentId);
      // ---------------------

      for (const variant of variants) {
        const variantId = (variant as any).id;

        // Agora isso vai retornar TRUE para o ID do pai
        const isUpdate = variantId && existingVariantIds.has(variantId);

        const finalName = parentData
          ? `${parentData.name} ${variant.name}`
          : variant.name;

        // Dados mesclados para update/create
        const productData = {
          ...variant,
          name: finalName,
          variantName: parentData ? variant.name : null,
          brand: parentData?.brand || variant.brand,
          description: parentData?.description || variant.description,
          ncm: parentData?.ncm || variant.ncm,
          cest: parentData?.cest || variant.cest,
          cfop: parentData?.cfop || variant.cfop,
          origin: parentData?.origin ?? variant.origin,
          taxProfileId: parentData?.taxProfileId || variant.taxProfileId,
        };

        if (isUpdate) {
          // UPDATE (Vai cair aqui agora)
          const product = await this.updateSingleProductInternal(
            tx,
            variantId,
            productData,
            tenantId,
            user,
            warehouse.id,
          );
          updatedProducts.push(product);
        } else {
          // CREATE (Nova variante)
          const product = await this.createSingleProductInternal(
            tx,
            { ...productData, parentId },
            tenantId,
            user,
            warehouse.id,
          );
          updatedProducts.push(product);
        }
      }

      return {
        parentId,
        products: updatedProducts,
        message: `${updatedProducts.length} produto(s) atualizado(s) com sucesso`,
      };
    });
  }

  async update(
    id: string,
    updateDto: UpdateProductDto,
    tenantId: string,
    user: any,
  ) {
    // Garante que existe antes de abrir transação
    await this.findOne(id, tenantId);

    return this.prisma.$transaction(async (tx) => {
      const warehouse = await this.getOrCreateDefaultWarehouse(tenantId, tx);
      return this.updateSingleProductInternal(
        tx,
        id,
        updateDto,
        tenantId,
        user,
        warehouse.id,
      );
    });
  }

  async remove(id: string, tenantId: string) {
    await this.findOne(id, tenantId);
    return this.prisma.product.delete({ where: { id } });
  }

  // ===========================================================================
  // PRIVATE HELPERS (CORE LOGIC)
  // ===========================================================================

  /**
   * Centraliza a criação de um único produto/variante
   * (Usado pelo create simples e pelo loop do createBatch)
   */
  private async createSingleProductInternal(
    tx: any,
    data: any,
    tenantId: string,
    user: any,
    defaultWarehouseId: string,
  ) {
    const sku = await this.ensureUniqueSku(tx, data.sku, tenantId);

    // 1. Cria registro na tabela products
    const product = await tx.product.create({
      data: {
        tenantId,
        name: data.name,
        variantName: data.variantName || null,
        parentId: data.parentId || null,
        brand: data.brand || '',
        description: data.description || '',
        sku: sku,
        unit: data.unit || 'UN',
        ncm: data.ncm || '',
        cest: data.cest || '',
        cfop: data.cfop || '',
        origin: Number(data.origin || 0),
        taxProfileId: data.taxProfileId || null,
        costPrice: Number(data.costPrice || 0),
        expenses: Number(data.expenses || 0),
        markup: Number(data.markup || 0),
        isActive: true,
      },
    });

    // 2. Manipuladores de sub-recursos
    await this.handleImages(tx, product.id, data.images);

    await this.handleStock(
      tx,
      product.id,
      data.stock,
      defaultWarehouseId,
      tenantId,
      user,
      product.costPrice,
      true,
    );

    await this.handlePrices(
      tx,
      product.id,
      data.prices,
      user.userId,
      'Cadastro Inicial',
      tenantId,
    );

    await this.handleSupplier(
      tx,
      product.id,
      tenantId,
      data.supplier,
      product.costPrice,
    );

    return product;
  }

  /**
   * Centraliza a atualização de um único produto/variante
   */
  private async updateSingleProductInternal(
    tx: any,
    productId: string,
    data: any,
    tenantId: string,
    user: any,
    defaultWarehouseId: string,
  ) {
    // 1. Atualiza dados básicos
    const updateData: any = {
      name: data.name,
      variantName: data.variantName,
      brand: data.brand || '',
      description: data.description || '',
      unit: data.unit,
      ncm: data.ncm || '',
      cest: data.cest || '',
      cfop: data.cfop || '',
      origin: Number(data.origin || 0),
      taxProfileId: data.taxProfileId || null,
      costPrice: data.costPrice ? Number(data.costPrice) : undefined,
      expenses: data.expenses ? Number(data.expenses) : undefined,
      markup: data.markup ? Number(data.markup) : undefined,
    };

    if (data.sku) {
      // Se mudou SKU, verifica unicidade (opcional, dependendo da regra de negócio)
      updateData.sku = data.sku.toUpperCase();
    }

    const product = await tx.product.update({
      where: { id: productId },
      data: updateData,
    });

    // 2. Manipuladores de sub-recursos
    if (data.images) await this.handleImages(tx, productId, data.images);

    // Nota: Update geralmente só altera config de estoque (min/max), não lança movimento
    if (data.stock)
      await this.handleStock(
        tx,
        productId,
        data.stock,
        defaultWarehouseId,
        tenantId,
        user,
        product.costPrice,
        false,
      );

    if (data.prices)
      await this.handlePrices(
        tx,
        productId,
        data.prices,
        user.userId,
        data.changeReason || 'Alteração manual',
        tenantId,
      );

    if (data.supplier !== undefined)
      await this.handleSupplier(
        tx,
        productId,
        tenantId,
        data.supplier,
        product.costPrice,
      );

    return product;
  }

  // --- Sub-Handlers ---

  private async handleImages(tx: any, productId: string, images: any[]) {
    if (!images) return;

    // Estratégia simples: remove todos e recria (idempotente)
    // Se quiser otimizar no futuro, faça diff
    await tx.productImage.deleteMany({ where: { productId } });

    if (images.length > 0) {
      await tx.productImage.createMany({
        data: images.map((img) => ({
          productId,
          url: img.url,
          order: img.order || 0,
        })),
      });
    }
  }

  private async handleStock(
    tx: any,
    productId: string,
    stockData: any,
    defaultWarehouseId: string,
    tenantId: string,
    user: any,
    costPrice: any,
    isCreation: boolean,
  ) {
    if (!stockData && !isCreation) return; // Se é update e não veio stock, ignora

    const targetWarehouseId = stockData?.warehouseId || defaultWarehouseId;
    const initialQty = Number(stockData?.quantity || 0);

    if (isCreation) {
      // Cria stock item
      await tx.stockItem.create({
        data: {
          productId,
          warehouseId: targetWarehouseId,
          quantity: initialQty,
          minStock: Number(stockData?.minStock || 0),
          maxStock: Number(stockData?.maxStock || 0),
        },
      });

      // Lança movimento inicial se houver qtd
      if (initialQty > 0) {
        await tx.stockMovement.create({
          data: {
            tenantId,
            productId,
            type: 'ENTRY',
            quantity: initialQty,
            reason: 'Saldo Inicial (Cadastro)',
            costPrice: costPrice,
            balanceAfter: initialQty,
            userId: user.userId,
            toWarehouseId: targetWarehouseId,
          },
        });
      }
    } else {
      // Update: apenas atualiza min/max ou cria se não existir (sem movimentar estoque)
      const existingStock = await tx.stockItem.findUnique({
        where: {
          productId_warehouseId: { productId, warehouseId: targetWarehouseId },
        },
      });

      if (existingStock) {
        await tx.stockItem.update({
          where: { id: existingStock.id },
          data: {
            minStock: Number(stockData.minStock || 0),
            maxStock: Number(stockData.maxStock || 0),
          },
        });
      } else {
        await tx.stockItem.create({
          data: {
            productId,
            warehouseId: targetWarehouseId,
            quantity: 0, // Update não adiciona saldo magicamente
            minStock: Number(stockData.minStock || 0),
            maxStock: Number(stockData.maxStock || 0),
          },
        });
      }
    }
  }

  private async handlePrices(
    tx: any,
    productId: string,
    prices: any[],
    userId: string,
    reason: string,
    tenantId: string,
  ) {
    if (!prices || prices.length === 0) return;

    for (const p of prices) {
      const newPriceVal = Number(p.price);

      // Busca preço atual para logar histórico corretamente
      const currentPriceObj = await tx.productPrice.findUnique({
        where: {
          productId_priceListId: { productId, priceListId: p.priceListId },
        },
      });
      const currentPriceVal = currentPriceObj
        ? Number(currentPriceObj.price)
        : 0;

      if (currentPriceVal !== newPriceVal || !currentPriceObj) {
        await tx.productPrice.upsert({
          where: {
            productId_priceListId: { productId, priceListId: p.priceListId },
          },
          update: { price: newPriceVal },
          create: {
            productId,
            priceListId: p.priceListId,
            price: newPriceVal,
            tenantId,
          },
        });

        await tx.productPriceHistory.create({
          data: {
            productId,
            priceListId: p.priceListId,
            oldPrice: currentPriceVal,
            newPrice: newPriceVal,
            reason,
            changedBy: userId,
          },
        });
      }
    }
  }

  private async handleSupplier(
    tx: any,
    productId: string,
    tenantId: string,
    supplierData: any,
    defaultCost: number,
  ) {
    // Se veio null explicitamente no update, deleta. Se undefined, ignora.
    if (supplierData === null) {
      await tx.productSupplier.deleteMany({ where: { productId } });
      return;
    }

    if (supplierData && supplierData.supplierId) {
      const lastPrice = Number(supplierData.lastPrice || defaultCost);

      await tx.productSupplier.upsert({
        where: { productId },
        create: {
          tenantId,
          productId,
          supplierId: supplierData.supplierId,
          supplierProductCode: supplierData.supplierProductCode,
          lastPrice,
        },
        update: {
          supplierId: supplierData.supplierId,
          supplierProductCode: supplierData.supplierProductCode,
          lastPrice,
        },
      });
    }
  }

  private async ensureUniqueSku(
    tx: any,
    providedSku: string | undefined,
    tenantId: string,
  ): Promise<string> {
    const sku = providedSku
      ? providedSku.toUpperCase()
      : `PRD-${generateSku()}`;

    const skuExists = await tx.product.findUnique({
      where: {
        tenantId_sku: {
          tenantId: tenantId, // Você precisa ter o tenantId disponível nessa função
          sku: sku.toUpperCase(), // ou a variável que contém o SKU
        },
      },
    });

    if (skuExists && skuExists.tenantId === tenantId) {
      throw new BadRequestException(`SKU ${sku} já existente neste tenant.`);
    }
    return sku;
  }

  private async getOrCreateDefaultWarehouse(tenantId: string, tx: any) {
    const defaultWh = await tx.warehouse.findFirst({
      where: { tenantId, isDefault: true },
    });
    if (defaultWh) return defaultWh;

    const anyWh = await tx.warehouse.findFirst({
      where: { tenantId },
      orderBy: { createdAt: 'asc' },
    });
    if (anyWh) return anyWh;

    return tx.warehouse.create({
      data: { tenantId, name: 'Depósito Principal (Matriz)', isDefault: true },
    });
  }

  // ===========================================================================
  // READ METHODS (FIND/CALCULATE) - Mantidos inalterados na lógica
  // ===========================================================================

  async findOne(id: string, tenantId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: {
        images: { orderBy: { order: 'asc' } },
        stock: { include: { warehouse: true } },
        prices: true,
        taxProfile: true,
        variants: {
          include: {
            stock: true,
            prices: true,
            supplier: { include: { supplier: true } },
          },
        },
        supplier: { include: { supplier: true } },
      },
    });

    if (!product || product.tenantId !== tenantId) {
      throw new NotFoundException('Produto não encontrado.');
    }

    const stockItem = product.stock?.[0] || {
      quantity: 0,
      minStock: 0,
      maxStock: 0,
    };
    return {
      ...product,
      supplier: product.supplier ?? product.variants[0]?.supplier,
      stock: stockItem,
      stockItems: product.stock,
    };
  }

  async findAll(tenantId: string, user: { role: string }) {
    const products = await this.prisma.product.findMany({
      where: { tenantId, variants: { none: {} } },
      include: {
        stock: { include: { warehouse: true } },
        images: { orderBy: { order: 'asc' }, take: 1 },
        prices: { include: { priceList: true } },
        parent: { select: { name: true } },
        supplier: { include: { supplier: true } },
        variants: {
          include: {
            stock: true,
            prices: { include: { priceList: true } },
            supplier: { include: { supplier: true } },
            images: { take: 1 },
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    return products.map((p) => {
      // 1. Define a regra de visualização no início do map
      const canViewCost = user.role !== 'SELLER';

      // --- AJUSTE SOLICITADO: Cálculo de Estoque Híbrido ---
      let totalStock = 0;

      if (p.variants.length > 0) {
        // Cenário 1: Tem variantes -> Soma o estoque de todas as variações
        totalStock = p.variants.reduce(
          (accV, v) =>
            accV + v.stock.reduce((accS, s) => accS + Number(s.quantity), 0),
          0,
        );
      } else {
        // Cenário 2: Produto Simples -> Soma o próprio estoque
        totalStock = p.stock.reduce((accS, s) => accS + Number(s.quantity), 0);
      }
      // -----------------------------------------------------

      const supplierInfo = p.supplier
        ? {
            id: p.supplier.supplierId,
            name: p.supplier.supplier.name,
            productCode: p.supplier.supplierProductCode,
            // 2. Oculta custo no contrato do fornecedor
            contractCost: canViewCost ? Number(p.supplier.lastPrice) : 0,
          }
        : p.variants[0]?.supplier?.supplier;

      const salePrices = p.prices.map((pr) => ({
        listId: pr.priceListId,
        listName: pr.priceList.name,
        price: Number(pr.price),
        adjustment: Number(pr.priceList.percentageAdjustment || 0),
      }));

      return {
        id: p.id,
        sku: p.sku,
        name: p.name,
        brand: p.brand,
        ean: p.ean,
        unit: p.unit,
        isActive: p.isActive,
        imageUrl: p.images[0]?.url || null,
        inventory: {
          total: totalStock,
          locations: p.stock.map((s) => ({
            warehouse: s.warehouse.name,
            qty: Number(s.quantity),
          })),
        },
        financial: {
          // 3. Oculta custo base
          baseCost: canViewCost ? Number(p.costPrice) : 0,
          markup: Number(p.markup),
          prices: salePrices,
        },
        supplier: supplierInfo,
        isVariant: !!p.parentId,
        variants: p.variants.map((v) => ({
          id: v.id,
          name: v.name,
          variantName: v.variantName,
          sku: v.sku,
          supplier: supplierInfo,
          priceSales: v.prices.map((pr) => ({
            listId: pr.priceListId,
            listName: pr.priceList.name,
            price: Number(pr.price),
            // 4. Oculta custo nas variações
            priceCost: canViewCost ? Number(v.costPrice) : 0,
            adjustment: Number(pr.priceList.percentageAdjustment || 0),
          })),
          imageUrl: v.images[0]?.url || null,
          stock: v.stock.reduce((a, b) => a + Number(b.quantity), 0),
        })),
      };
    });
  }

  async findSellable(tenantId: string, user: any) {
    // 1. Identifica os depósitos: Do Vendedor e da Matriz (Default)
    let sellerWarehouseId: string | null = null;
    let defaultWarehouseId: string | null = null;

    // Busca ID da Matriz
    const matrix = await this.prisma.warehouse.findFirst({
      where: { tenantId, isDefault: true },
      select: { id: true },
    });
    defaultWarehouseId = matrix?.id ?? null;

    // Se for SELLER, busca o depósito dele
    if (user.role === 'SELLER') {
      const warehouse = await this.prisma.warehouse.findFirst({
        where: {
          responsibleUserId: user.userId,
          tenantId,
        },
        select: { id: true },
      });
      sellerWarehouseId = warehouse?.id ?? null;
    }

    const products = await this.prisma.product.findMany({
      where: { tenantId, variants: { none: {} }, isActive: true },
      include: {
        stock: true,
        images: { orderBy: { order: 'asc' }, take: 1 },
        prices: { include: { priceList: true } },
        parent: { select: { name: true } },
        supplier: { include: { supplier: true } },
      },
      orderBy: { name: 'asc' },
    });

    return products.map((product) => {
      // Monta o nome completo
      const displayName = product.parent
        ? `${product.name || ''}` // Mantive conforme seu snippet
        : product.name;

      let totalStock = 0;
      let stockInMatrix = 0; // Nova prop para o frontend

      // 2. Lógica de Estoque Condicional
      if (user.role === 'SELLER' && sellerWarehouseId) {
        // Busca estoque no depósito do vendedor
        const sellerEntry = product.stock.find(
          (s) => s.warehouseId === sellerWarehouseId,
        );
        totalStock = Number(sellerEntry?.quantity || 0);

        // SE O ESTOQUE DO VENDEDOR ESTIVER ZERADO, verifica na Matriz
        if (totalStock === 0 && defaultWarehouseId) {
          const matrixEntry = product.stock.find(
            (s) => s.warehouseId === defaultWarehouseId,
          );
          stockInMatrix = Number(matrixEntry?.quantity || 0);
        }
      } else {
        // ADMIN/OUTROS: Soma tudo
        totalStock = product.stock.reduce(
          (acc, s) => acc + Number(s.quantity),
          0,
        );
      }

      const basePrice = product.prices[0]?.price || 0;

      return {
        ...product,
        name: displayName,
        totalStock,
        matrixStock: stockInMatrix, // Envia para o front (0 se tiver estoque próprio ou não for seller)
        basePrice,
      };
    });
  }

  async calculatePricing(dto: CalculatePriceDto, tenantId: string) {
    const { costPrice, expenses, markup, taxProfileId, destinationState } = dto;
    const cost = Number(costPrice);
    const expensesPct = Number(expenses);
    const markupPct = Number(markup);

    let icmsRate = 0,
      pisRate = 0,
      cofinsRate = 0,
      ipiRate = 0;
    let activeRuleName = 'Sem Perfil Tributário';

    if (taxProfileId) {
      const profile = await this.prisma.taxProfile.findUnique({
        where: { id: taxProfileId },
        include: { rules: true },
      });

      if (profile && profile.rules.length > 0) {
        let rule = profile.rules.find(
          (r) => r.destinationState === destinationState,
        );
        if (!rule) {
          rule =
            profile.rules.find((r) => r.originState === r.destinationState) ||
            profile.rules[0];
        }
        if (rule) {
          icmsRate = Number(rule.icmsRate);
          pisRate = Number(rule.pisRate);
          cofinsRate = Number(rule.cofinsRate);
          ipiRate = Number(rule.ipiRate);
          activeRuleName = `${rule.originState} ➝ ${rule.destinationState}`;
        }
      }
    }

    const taxesTotalPct = icmsRate + pisRate + cofinsRate + ipiRate;
    const totalDeductionsPct = taxesTotalPct + expensesPct;
    const profitValue = cost * (markupPct / 100);
    const netValueRequired = cost + profitValue;
    const divisor = (100 - totalDeductionsPct) / 100;
    const finalPrice = divisor > 0 ? netValueRequired / divisor : 0;

    return {
      basePrice: Math.round(finalPrice * 100) / 100,
      calculationDetails: {
        cost,
        profitValue,
        netValueRequired,
        totalDeductionsPct,
        activeRuleName,
        taxValues: {
          icms: finalPrice * (icmsRate / 100),
          pis: finalPrice * (pisRate / 100),
          cofins: finalPrice * (cofinsRate / 100),
          ipi: finalPrice * (ipiRate / 100),
          others: finalPrice * (expensesPct / 100),
          totalTaxes: finalPrice * (taxesTotalPct / 100),
        },
        rates: { icmsRate, pisRate, cofinsRate, ipiRate, expensesPct },
      },
    };
  }
}
