import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createLogger } from '../core/logging';
import { customAlphabet } from 'nanoid';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateProductDto,
  CreateProductBatchDto,
} from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { User } from '@prisma/client';
import { CalculatePriceDto } from './dto/calculate-price.dto';

// Core imports
import { ERROR_MESSAGES, ENTITY_NAMES, SYSTEM_LIMITS } from '../core/constants';
import { toNumber, roundTo } from '../core/utils/number.utils';

const generateSku = customAlphabet(
  '123456789ABCDEFGHJKLMNPQRSTUVWXYZ',
  SYSTEM_LIMITS.SKU_LENGTH,
);

@Injectable()
export class ProductsService {
  private readonly logger = createLogger(ProductsService.name);

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

      // 1. Cria o PAI (se houver dados)das
      if (parentData) {
        await this.resolveTaxCodes(parentData, tx);
        const parentSku = parentData.sku || `GRP-${generateSku()}`;
        const parent = await tx.product.create({
          data: {
            tenantId,
            name: parentData.name,
            description: parentData.description || '',
            brand: parentData.brand || '',
            sku: parentSku.toUpperCase(),
            ncmCode: parentData.ncm,
            cestCode: parentData.cest || null,
            cfopCode: parentData.cfop || null,
            origin: toNumber(parentData.origin),
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
        // Prepara dados mesclando pai e filho
        const productData = {
          ...variant,
          name: variant.name,
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
        throw new NotFoundException(
          ERROR_MESSAGES.NOT_FOUND(ENTITY_NAMES.PRODUCT),
        );
      }

      // Atualiza PAI (Dados gerais)
      if (parentData && existingParent.variants.length > 0) {
        await this.resolveTaxCodes(parentData, tx);
        await tx.product.update({
          where: { id: parentId },
          data: {
            name: parentData.name,
            description: parentData.description || '',
            brand: parentData.brand || '',
            ncmCode: parentData.ncm,
            cestCode: parentData.cest || null,
            cfopCode: parentData.cfop || null,
            origin: toNumber(parentData.origin),
            taxProfileId: parentData.taxProfileId || null,
          },
        });
      }

      const updatedProducts: any[] = [];
      const existingVariantIds = new Set(
        existingParent.variants.map((v) => v.id),
      );
      existingVariantIds.add(parentId);

      for (const variant of variants) {
        const variantId = (variant as any).id;
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

  // 🔥 AJUSTADO: Soft Delete em Cascata e Liberação de SKU
  async remove(id: string, tenantId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: { variants: true }, // Trazemos as variantes para apagar em cascata
    });

    if (!product || product.tenantId !== tenantId) {
      throw new NotFoundException(
        ERROR_MESSAGES.NOT_FOUND(ENTITY_NAMES.PRODUCT),
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const deletedSuffix = `-deleted-${Date.now()}`;

      // 1. Soft Delete no Produto Principal
      const deletedProduct = await tx.product.update({
        where: { id },
        data: {
          isActive: false,
          sku: `${product.sku}${deletedSuffix}`, // Libera o SKU
        },
      });

      // 2. Se for um Produto Pai, aplica Soft Delete nas Variações também
      if (product.variants && product.variants.length > 0) {
        for (const variant of product.variants) {
          await tx.product.update({
            where: { id: variant.id },
            data: {
              isActive: false,
              sku: `${variant.sku}${deletedSuffix}`, // Libera o SKU da variação
            },
          });
        }
      }

      return deletedProduct;
    });
  }

  // ===========================================================================
  // PRIVATE HELPERS (CORE LOGIC)
  // ===========================================================================

  private async createSingleProductInternal(
    tx: any,
    data: any,
    tenantId: string,
    user: any,
    defaultWarehouseId: string,
  ) {
    await this.resolveTaxCodes(data, tx);
    const sku = await this.ensureUniqueSku(tx, data.sku, tenantId);

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
        ncmCode: data.ncm || '',
        cestCode: data.cest || null,
        cfopCode: data.cfop || null,
        origin: toNumber(data.origin),
        taxProfileId: data.taxProfileId || null,
        costPrice: toNumber(data.costPrice),
        expenses: toNumber(data.expenses),
        markup: toNumber(data.markup),
        isActive: true,
      },
    });

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

  private async updateSingleProductInternal(
    tx: any,
    productId: string,
    data: any,
    tenantId: string,
    user: any,
    defaultWarehouseId: string,
  ) {
    await this.resolveTaxCodes(data, tx);
    const updateData: any = {
      name: data.name,
      variantName: data.variantName,
      brand: data.brand || '',
      description: data.description || '',
      unit: data.unit,
      ncmCode: data.ncm || '',
      cestCode: data.cest || null,
      cfopCode: data.cfop || null,
      origin: toNumber(data.origin),
      taxProfileId: data.taxProfileId || null,
      costPrice: data.costPrice ? toNumber(data.costPrice) : undefined,
      expenses: data.expenses ? toNumber(data.expenses) : undefined,
      markup: data.markup ? toNumber(data.markup) : undefined,
    };

    if (data.sku) {
      updateData.sku = data.sku.toUpperCase();
    }

    const product = await tx.product.update({
      where: { id: productId },
      data: updateData,
    });

    if (data.images) await this.handleImages(tx, productId, data.images);

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
    if (!stockData && !isCreation) return;

    const targetWarehouseId = stockData?.warehouseId || defaultWarehouseId;
    const initialQty = toNumber(stockData?.quantity);

    if (isCreation) {
      await tx.stockItem.create({
        data: {
          productId,
          warehouseId: targetWarehouseId,
          quantity: initialQty,
          minStock: toNumber(stockData?.minStock),
          maxStock: toNumber(stockData?.maxStock),
        },
      });

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
      const existingStock = await tx.stockItem.findUnique({
        where: {
          productId_warehouseId: { productId, warehouseId: targetWarehouseId },
        },
      });

      if (existingStock) {
        await tx.stockItem.update({
          where: { id: existingStock.id },
          data: {
            minStock: toNumber(stockData.minStock),
            maxStock: toNumber(stockData.maxStock),
          },
        });
      } else {
        await tx.stockItem.create({
          data: {
            productId,
            warehouseId: targetWarehouseId,
            quantity: 0,
            minStock: toNumber(stockData.minStock),
            maxStock: toNumber(stockData.maxStock),
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
      const newPriceVal = toNumber(p.price);

      const currentPriceObj = await tx.productPrice.findUnique({
        where: {
          productId_priceListId: { productId, priceListId: p.priceListId },
        },
      });
      const currentPriceVal = currentPriceObj
        ? toNumber(currentPriceObj.price)
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
    if (supplierData === null) {
      await tx.productSupplier.deleteMany({ where: { productId } });
      return;
    }

    if (supplierData && supplierData.supplierId) {
      const lastPrice = toNumber(supplierData.lastPrice) || defaultCost;

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

  private async resolveTaxCodes(data: any, tx: any) {
    if (!data) return;

    // Resolve NCM
    if (data.ncm && data.ncm.length > 15) {
      const record = await tx.ncm.findUnique({ where: { id: data.ncm } });
      if (record) data.ncm = record.code;
    }

    // Resolve CEST
    if (data.cest && data.cest.length > 15) {
      const record = await tx.cest.findUnique({ where: { id: data.cest } });
      if (record) data.cest = record.code;
    } else if (data.cest === '') {
      data.cest = null;
    }

    // Resolve CFOP
    if (data.cfop && data.cfop.length > 15) {
      const record = await tx.cfop.findUnique({ where: { id: data.cfop } });
      if (record) data.cfop = record.code;
    } else if (data.cfop === '') {
      data.cfop = null;
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
          tenantId: tenantId,
          sku: sku.toUpperCase(),
        },
      },
    });

    // Ignora conflitos com SKUs que já foram apagados (Soft Delete)
    if (skuExists && skuExists.tenantId === tenantId && skuExists.isActive) {
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
  // READ METHODS (FIND/CALCULATE)
  // ===========================================================================

  async findOne(id: string, tenantId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      // 🔥 MANTIDO SEM isActive AQUI: Assim o histórico de vendas antigas consegue
      // resgatar os dados do produto mesmo que ele tenha sido deletado.
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
      throw new NotFoundException(
        ERROR_MESSAGES.NOT_FOUND(ENTITY_NAMES.PRODUCT),
      );
    }

    const stockItem = product.stock?.[0] || {
      quantity: 0,
      minStock: 0,
      maxStock: 0,
    };
    return {
      ...product,
      ncm: product.ncmCode,
      cest: product.cestCode,
      cfop: product.cfopCode,
      supplier: product.supplier ?? product.variants[0]?.supplier,
      stock: stockItem,
      stockItems: product.stock,
    };
  }

  async findAll(tenantId: string, user: { role: string }) {
    const products = await this.prisma.product.findMany({
      where: {
        tenantId,
        parentId: null, // 🔥 CORREÇÃO: Pega os Produtos Pais ou Produtos Simples
        isActive: true, // 🔥 NOVO: Ignora os deletados
      },
      include: {
        stock: { include: { warehouse: true } },
        images: { orderBy: { order: 'asc' }, take: 1 },
        prices: { include: { priceList: true } },
        parent: { select: { name: true } },
        supplier: { include: { supplier: true } },
        variants: {
          where: { isActive: true }, // 🔥 NOVO: Ignora variantes deletadas individualmente
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
      const canViewCost = user.role !== 'SELLER';

      let totalStock = 0;

      if (p.variants.length > 0) {
        totalStock = p.variants.reduce(
          (accV, v) =>
            accV + v.stock.reduce((accS, s) => accS + toNumber(s.quantity), 0),
          0,
        );
      } else {
        totalStock = p.stock.reduce(
          (accS, s) => accS + toNumber(s.quantity),
          0,
        );
      }

      const supplierInfo = p.supplier
        ? {
            id: p.supplier.supplierId,
            name: p.supplier.supplier.name,
            productCode: p.supplier.supplierProductCode,
            contractCost: canViewCost ? toNumber(p.supplier.lastPrice) : 0,
          }
        : p.variants[0]?.supplier?.supplier;

      const salePrices = p.prices.map((pr) => ({
        listId: pr.priceListId,
        listName: pr.priceList.name,
        price: toNumber(pr.price),
        adjustment: toNumber(pr.priceList.percentageAdjustment),
      }));

      return {
        id: p.id,
        sku: p.sku,
        name: p.name,
        brand: p.brand,
        ean: p.ean,
        unit: p.unit,
        ncm: p.ncmCode,
        cest: p.cestCode,
        cfop: p.cfopCode,
        isActive: p.isActive,
        imageUrl: p.images[0]?.url || null,
        inventory: {
          total: totalStock,
          locations: p.stock.map((s) => ({
            warehouse: s.warehouse.name,
            qty: toNumber(s.quantity),
          })),
        },
        financial: {
          baseCost: canViewCost ? toNumber(p.costPrice) : 0,
          markup: toNumber(p.markup),
        },
        prices: salePrices,
        supplier: supplierInfo,
        isVariant: !!p.parentId,
        variants: p.variants.map((v) => ({
          id: v.id,
          name: v.name,
          variantName: v.variantName,
          sku: v.sku,
          ncm: v.ncmCode,
          cest: v.cestCode,
          cfop: v.cfopCode,
          supplier: supplierInfo,
          priceSales: v.prices.map((pr) => ({
            listId: pr.priceListId,
            listName: pr.priceList.name,
            price: toNumber(pr.price),
            priceCost: canViewCost ? toNumber(v.costPrice) : 0,
            adjustment: toNumber(pr.priceList.percentageAdjustment),
          })),
          imageUrl: v.images[0]?.url || null,
          stock: v.stock.reduce((a, b) => a + toNumber(b.quantity), 0),
        })),
      };
    });
  }

  async findSellable(tenantId: string, user: any) {
    let sellerWarehouseId: string | null = null;
    let defaultWarehouseId: string | null = null;

    const matrix = await this.prisma.warehouse.findFirst({
      where: { tenantId, isDefault: true },
      select: { id: true },
    });
    defaultWarehouseId = matrix?.id ?? null;

    const currentUserId = user.id || user.userId;

    if (user.role === 'SELLER') {
      const warehouse = await this.prisma.warehouse.findFirst({
        where: {
          responsibleUserId: currentUserId,
          tenantId,
        },
        select: { id: true },
      });
      sellerWarehouseId = warehouse?.id ?? null;
    }

    const products = await this.prisma.product.findMany({
      // 🔥 NOVO: Garante que os apagados não aparecerão no PDV
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
      const displayName = product.parent
        ? `${product.name || ''}`
        : product.name;

      let totalStock = 0;
      let stockInMatrix = 0;

      if (defaultWarehouseId) {
        const matrixEntry = product.stock.find(
          (s) => s.warehouseId === defaultWarehouseId,
        );
        stockInMatrix = toNumber(matrixEntry?.quantity);
      }

      if (user.role === 'SELLER') {
        if (sellerWarehouseId) {
          const sellerEntry = product.stock.find(
            (s) => s.warehouseId === sellerWarehouseId,
          );
          totalStock = toNumber(sellerEntry?.quantity);
        } else {
          totalStock = 0;
        }
      } else {
        totalStock = product.stock.reduce(
          (acc, s) => acc + toNumber(s.quantity),
          0,
        );
      }

      const basePrice = product.prices[0]?.price || 0;

      return {
        ...product,
        ncm: (product as any).ncmCode,
        cest: (product as any).cestCode,
        cfop: (product as any).cfopCode,
        name: displayName,
        totalStock,
        matrixStock: stockInMatrix,
        basePrice,
      };
    });
  }

  async calculatePricing(dto: CalculatePriceDto, tenantId: string) {
    const { costPrice, expenses, markup, taxProfileId, destinationState } = dto;
    const cost = toNumber(costPrice);
    const expensesPct = toNumber(expenses);
    const markupPct = toNumber(markup);

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
          icmsRate = toNumber(rule.icmsRate);
          pisRate = toNumber(rule.pisRate);
          cofinsRate = toNumber(rule.cofinsRate);
          ipiRate = toNumber(rule.ipiRate);
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
