import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { XMLParser } from 'fast-xml-parser';
import { ProductsService } from '../products/products.service';
import { StockService } from 'src/stock/stock.service';
import type { User } from '@prisma/client';

type ParsedItem = {
  index: number;
  code: string;
  ean?: string | null;
  name: string;
  ncm?: string;
  cfop?: string;
  unit?: string;
  quantity: number;
  unitPrice: number;
  totalPrice?: number;
  suggestedAction?: string;
  id?: string | null;
  suggestedTargetIndex?: number | null;
};

@Injectable()
export class NfeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly productsService: ProductsService,
    private readonly stockService: StockService,
  ) {}

  // -------------------- Helpers de Texto --------------------
  private cleanProductName(name: string): string {
    return name
      .toUpperCase()
      .replace(/\s+-\s+/g, ' ')
      .replace(/\b\d+([.,]\d+)?\s*(ML|L|G|KG|MG|M|MM|CM|UN|PC|CX)\b/gi, '')
      .replace(/[^\p{L}0-9\s]/gu, '') // Ajustado regex para aceitar números também
      .replace(/\s+/g, ' ')
      .trim();
  }

  private extractVariantName(
    fullName: string,
    parentName: string,
  ): string | null {
    const full = fullName.toUpperCase().replace(/[^\p{L}0-9\s]/gu, '');
    const parent = parentName.toUpperCase().replace(/[^\p{L}0-9\s]/gu, '');
    const variantParts = full
      .split(' ')
      .filter((word) => !parent.includes(word));
    return variantParts.length > 0 ? variantParts.join(' ') : null;
  }

  private calculateSimilarity(originalS1: string, originalS2: string): number {
    const s1 = this.cleanProductName(originalS1);
    const s2 = this.cleanProductName(originalS2);

    if (!s1 || !s2) return 0;
    if (s1 === s2) return 1.0;
    const wordsA = s1.split(' ');
    const wordsB = s2.split(' ');
    if (wordsA[0] !== wordsB[0]) return 0;
    const intersection = wordsA.filter((w) => wordsB.includes(w));
    const union = new Set([...wordsA, ...wordsB]);
    if (union.size === 0) return 0;
    return intersection.length / union.size;
  }

  // -------------------- Parser XML --------------------
  async parseNfeXml(fileBuffer: Buffer) {
    const parser = new XMLParser({
      ignoreAttributes: false,
      removeNSPrefix: true,
    });
    let jsonObj: any;
    try {
      jsonObj = parser.parse(fileBuffer.toString());
    } catch {
      throw new BadRequestException('XML inválido.');
    }

    const nfeProc = jsonObj?.nfeProc || jsonObj;
    const infNFe = nfeProc?.NFe?.infNFe;
    if (!infNFe) throw new BadRequestException('Estrutura NFe não encontrada.');

    const nfeData = {
      accessKey: nfeProc?.protNFe?.infProt?.chNFe || '',
      number: infNFe.ide?.nNF,
      series: infNFe.ide?.serie,
      issueDate: infNFe.ide?.dhEmi,
    };

    const emit = infNFe.emit;
    const supplierData = {
      document: emit?.CNPJ?.toString() || '',
      name: emit?.xFant || emit?.xNome,
      corporateName: emit?.xNome,
      ie: emit?.IE,
      street: emit?.enderEmit?.xLgr,
      number: String(emit?.enderEmit?.nro || 'S/N'),
      neighborhood: emit?.enderEmit?.xBairro,
      city: emit?.enderEmit?.xMun,
      state: emit?.enderEmit?.UF,
      zipCode: String(emit?.enderEmit?.CEP || ''),
      ibgeCode: String(emit?.enderEmit?.cMun || ''),
    };

    const detArray = Array.isArray(infNFe.det) ? infNFe.det : [infNFe.det];

    const products: ParsedItem[] = await Promise.all(
      detArray.map(async (det: any, index: number) => {
        const prod = det.prod;
        // Tenta achar produto pelo SKU (Código do fornecedor ou interno)
        const found = await this.prisma.product.findFirst({
          where: { sku: prod.cProd },
          select: { id: true, sku: true },
        });

        return {
          index,
          code: prod.cProd,
          ean: prod.cEAN !== 'SEM GTIN' ? prod.cEAN : null,
          name: prod.xProd,
          ncm: prod.NCM ? String(prod.NCM) : undefined,
          cfop: prod.CFOP ? String(prod.CFOP) : undefined,
          unit: prod.uCom,
          quantity: Number(prod.qCom) || 0,
          unitPrice: Number(prod.vUnCom) || 0,
          totalPrice: Number(prod.vProd) || undefined,
          suggestedAction: found ? 'LINK_EXISTING' : 'NEW',
          id: found ? found.id : null,
          suggestedTargetIndex: null,
        };
      }),
    );

    // Detecção de variantes
    for (let i = 0; i < products.length; i++) {
      const current = products[i];
      // FIX 1: Se já existe (found), não tente sugerir agrupamento
      if (current.id) continue;

      for (let j = 0; j < i; j++) {
        const candidate = products[j];
        if (this.calculateSimilarity(current.name, candidate.name) > 0.8) {
          current.suggestedAction = 'LINK_XML_INDEX';
          current.suggestedTargetIndex = j;
          break;
        }
      }
    }

    return { nfe: nfeData, supplier: supplierData, products };
  }

  // -------------------- Importação (Core) --------------------
  async importNfe(payload: any, tenantId: string, user: User) {
    const { supplier, products, nfe, mappings } = payload;
    supplier.document = supplier.document?.toString?.() ?? '';

    // 1. Garante fornecedor
    const supplierDb = await this.ensureSupplier(supplier, tenantId);

    // 2. Garante depósito padrão
    const warehouse =
      await this.stockService.getOrCreateDefaultWarehouse(tenantId);
    if (!warehouse)
      throw new BadRequestException('Nenhum depósito encontrado.');

    // 3. Busca listas de preço ativas
    const priceLists = await this.prisma.priceList.findMany({
      where: { tenantId, isActive: true },
    });

    const createdParentsMap: Record<number, string> = {};

    // 4. Loop de Processamento
    for (let i = 0; i < products.length; i++) {
      const item: ParsedItem = products[i];
      const mapping = mappings?.[item.index] ?? { action: 'NEW' };
      const defaultMarkupPct = 100;

      const baseProductDto = {
        unit: item.unit,
        costPrice: item.unitPrice,
        markup: defaultMarkupPct,
        ncm: item.ncm,
        cfop: item.cfop,
        stock: { warehouseId: warehouse.id, quantity: 0 },
        prices: priceLists.map((pl) => {
          const markup = item.unitPrice * (defaultMarkupPct / 100);
          const basePrice = item.unitPrice + markup;

          const adjustment =
            basePrice * (Number(pl.percentageAdjustment) / 100);

          return {
            priceListId: pl.id,
            price: basePrice + adjustment,
          };
        }),
        supplier: {
          supplierId: supplierDb.id,
          supplierProductCode: item.code,
          lastPrice: item.unitPrice,
        },
      };

      // --- CENÁRIO A: VINCULAR A PRODUTO EXISTENTE ---
      if (item.id) {
        await this.handleExistingProductUpdate(
          tenantId,
          item.id,
          warehouse.id,
          item,
          nfe,
          user.id,
          priceLists,
        );
        continue;
      }

      // --- CENÁRIO B: CRIAR NOVO PRODUTO ---
      if (mapping.action === 'NEW') {
        const isLeader = Object.values(mappings).some(
          (m: any) =>
            m.action === 'LINK_XML_INDEX' && m.targetIndex === item.index,
        );

        if (isLeader) {
          const cleanName = this.cleanProductName(item.name);
          const variantName =
            this.extractVariantName(item.name, cleanName) ?? item.name;

          // Cria Pai
          const parentProduct = await this.productsService.create(
            {
              ...baseProductDto,
              name: cleanName,
              sku: `GRP-${item.code}`,
              stock: null,
              prices: [],
              supplier: null,
            } as any,
            tenantId,
            user,
          );
          createdParentsMap[item.index] = parentProduct.id;

          // Cria Variante
          const variant = await this.productsService.create(
            {
              ...baseProductDto,
              name: `${cleanName} ${variantName}`,
              variantName,
              sku: item.code,
              parentId: parentProduct.id,
            } as any,
            tenantId,
            user,
          );

          await this.registerEntryTransactional(
            tenantId,
            variant.id,
            warehouse.id,
            item,
            nfe,
            user.id,
          );
        } else {
          // Produto Simples
          const created = await this.productsService.create(
            { ...baseProductDto, name: item.name, sku: item.code } as any,
            tenantId,
            user,
          );
          await this.registerEntryTransactional(
            tenantId,
            created.id,
            warehouse.id,
            item,
            nfe,
            user.id,
          );
        }
      }
      // --- CENÁRIO C: VINCULAR A PAI CRIADO NA NOTA ---
      else if (mapping.action === 'LINK_XML_INDEX') {
        const parentIndex = mapping.targetIndex;
        const parentId =
          createdParentsMap[parentIndex] ?? products[parentIndex]?.id;

        if (!parentId)
          throw new BadRequestException(`Pai do item ${i + 1} não encontrado.`);

        const cleanNameSelf = this.cleanProductName(item.name);
        const variantName =
          this.extractVariantName(item.name, cleanNameSelf) ?? item.name;

        const variant = await this.productsService.create(
          {
            ...baseProductDto,
            name: item.name,
            variantName,
            sku: item.code,
            parentId,
          } as any,
          tenantId,
          user,
        );
        await this.registerEntryTransactional(
          tenantId,
          variant.id,
          warehouse.id,
          item,
          nfe,
          user.id,
        );
      }
    }

    return { success: true, processed: products.length };
  }

  // -------------------- Helpers de Banco de Dados --------------------

  private async ensureSupplier(supplier: any, tenantId: string) {
    const existing = await this.prisma.supplier.findFirst({
      where: { document: supplier.document, tenantId },
    });
    if (existing) return existing;
    return this.prisma.supplier.create({
      data: {
        tenantId,
        name: supplier.name,
        corporateName: supplier.corporateName,
        document: supplier.document,
        email: supplier.email ?? 'nfe@import.com',
        phone: supplier.phone ?? '',
        street: supplier.street,
        number: supplier.number,
        neighborhood: supplier.neighborhood,
        city: supplier.city,
        state: supplier.state,
        zipCode: supplier.zipCode,
        ibgeCode: supplier.ibgeCode,
      },
    });
  }

  private calculateWeightedAverages(
    currentQty: number,
    currentCost: number,
    incomingQty: number,
    incomingCost: number,
  ) {
    const totalQty = currentQty + incomingQty;
    if (totalQty <= 0) return { avgCost: incomingCost };
    const avgCost =
      (currentQty * currentCost + incomingQty * incomingCost) / totalQty;
    return { avgCost };
  }

  private async handleExistingProductUpdate(
    tenantId: string,
    productId: string,
    warehouseId: string,
    item: ParsedItem,
    nfe: any,
    userId: string,
    priceLists: any[],
  ) {
    const [productDb, stockItem] = await Promise.all([
      this.prisma.product.findUnique({
        where: { id: productId },
        select: { id: true, costPrice: true, markup: true },
      }),
      this.prisma.stockItem.findUnique({
        where: { productId_warehouseId: { productId, warehouseId } },
        select: { quantity: true },
      }),
    ]);

    if (!productDb)
      throw new BadRequestException(`Produto ${productId} não encontrado.`);

    const currentQty = Number(stockItem?.quantity || 0);
    const currentCost = Number(productDb.costPrice || 0);
    const incomingQty = Number(item.quantity);
    const incomingCost = Number(item.unitPrice);

    const { avgCost } = this.calculateWeightedAverages(
      currentQty,
      currentCost,
      incomingQty,
      incomingCost,
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.product.update({
        where: { id: productId },
        data: { costPrice: avgCost },
      });

      // Se tiver índice, use upsert. Se não, use lógica manual find/create para evitar 42P10
      const stockUpsert = await tx.stockItem.upsert({
        where: { productId_warehouseId: { productId, warehouseId } },
        create: {
          productId,
          warehouseId,
          quantity: incomingQty,
          minStock: 0,
        },
        update: {
          quantity: { increment: incomingQty },
        },
      });

      await tx.stockMovement.create({
        data: {
          tenantId,
          productId,
          toWarehouseId: warehouseId,
          type: 'ENTRY',
          quantity: incomingQty,
          costPrice: incomingCost,
          reason: `Importação NFe ${nfe.number || ''}`,
          userId,
          balanceAfter: stockUpsert.quantity,
        },
      });

      const currentMarkup = Number(productDb.markup || 0);
      if (currentMarkup > 0) {
        for (const pl of priceLists) {
          const newSellingPrice = avgCost * (1 + currentMarkup / 100);
          await tx.productPrice.upsert({
            where: { productId_priceListId: { productId, priceListId: pl.id } },
            create: { productId, priceListId: pl.id, price: newSellingPrice },
            update: { price: newSellingPrice },
          });
        }
      }
    });
  }

  private async registerEntryTransactional(
    tenantId: string,
    productId: string,
    warehouseId: string,
    item: ParsedItem,
    nfe: any,
    userId: string,
  ) {
    await this.prisma.$transaction(async (tx) => {
      const stockUpsert = await tx.stockItem.upsert({
        where: { productId_warehouseId: { productId, warehouseId } },
        create: {
          productId,
          warehouseId,
          quantity: item.quantity,
          minStock: 0,
        },
        update: {
          quantity: { increment: item.quantity },
        },
      });

      await tx.stockMovement.create({
        data: {
          tenantId,
          productId,
          toWarehouseId: warehouseId,
          type: 'ENTRY',
          quantity: item.quantity,
          costPrice: item.unitPrice,
          reason: `Importação NFe ${nfe.number || 'Inicial'}`,
          userId,
          balanceAfter: stockUpsert.quantity,
        },
      });
    });
  }

  // --- MÉTODOS DO INBOX (AJUSTADO) ---

  async getInbox(tenantId: string) {
    return this.prisma.nfeInbox.findMany({
      where: {
        tenantId,
        status: 'PENDING',
      },
      orderBy: { receivedAt: 'desc' },
      select: {
        id: true,
        senderEmail: true,
        receivedAt: true,
        accessKey: true,
      },
    });
  }

  async processInboxItem(inboxId: string, tenantId: string, user: any) {
    const item = await this.prisma.nfeInbox.findUnique({
      where: { id: inboxId },
    });

    if (!item || item.tenantId !== tenantId) {
      throw new NotFoundException('Item não encontrado');
    }

    if (item.status !== 'PENDING') {
      throw new BadRequestException('Esta nota já foi processada.');
    }

    // Reutiliza o parser existente para transformar o XML do banco em objeto para o front
    const parsedData = await this.parseNfeXml(
      Buffer.from(item.xmlContent, 'utf-8'),
    );

    return parsedData;
  }

  async completeInboxImport(inboxId: string, tenantId: string) {
    await this.prisma.nfeInbox.update({
      where: { id: inboxId, tenantId },
      data: { status: 'IMPORTED' },
    });
  }

  async ignoreInboxItem(inboxId: string, tenantId: string) {
    const item = await this.prisma.nfeInbox.findUnique({
      where: { id: inboxId },
    });
    if (!item || item.tenantId !== tenantId) throw new NotFoundException();

    return this.prisma.nfeInbox.update({
      where: { id: inboxId },
      data: { status: 'IGNORED' },
    });
  }
}
