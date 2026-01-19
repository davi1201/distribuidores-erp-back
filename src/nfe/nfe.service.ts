import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { XMLParser } from 'fast-xml-parser';
import { ProductsService } from '../products/products.service';
import { StockService } from 'src/stock/stock.service';
import { FinancialService } from '../financial/financial.service'; // Importação do Financial
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
    private readonly financialService: FinancialService, // Injeção
  ) {}

  // -------------------- Helpers de Texto --------------------
  private cleanProductName(name: string): string {
    return name
      .toUpperCase()
      .replace(/\s+-\s+/g, ' ') // Remove ' - ' extra
      .replace(/\b\d+([.,]\d+)?\s*(ML|L|G|KG|MG|M|MM|CM|UN|PC|CX)\b/gi, '') // Remove medidas com números
      .replace(/\d+/g, '') // **Remove todos os números**
      .replace(/[^\p{L}\s]/gu, '') // Permite apenas letras e espaços
      .replace(/\s+/g, ' ') // Normaliza múltiplos espaços
      .trim(); // Trim final
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

  private generateSmartSku(name: string, originalCode: string): string {
    const cleanName = name.toUpperCase().trim();

    // 1. Prefixo (3 letras iniciais)
    // Remove palavras comuns inúteis para SKU como "O", "A", "DE", "PARA"
    const words = cleanName.split(' ').filter((w) => w.length > 2);
    const prefix = (words[0] || cleanName)
      .substring(0, 3)
      .replace(/[^A-Z]/g, 'PRD');

    const measureRegex =
      /\b\d+([.,]\d+)?\s*(ML|L|G|KG|MG|M|MM|CM|V|W|UN|PC)\b/i;
    const measureMatch = cleanName.match(measureRegex);
    let measure = '';

    if (measureMatch) {
      // Remove espaços e padroniza ponto
      measure = measureMatch[0]
        .toUpperCase()
        .replace(/\s/g, '')
        .replace(',', '.');
    }

    // 3. Sufixo (Últimos 4 digitos do código original para evitar colisão)
    // Se o código original for curto, usa ele todo
    const cleanCode = originalCode.replace(/[^a-zA-Z0-9]/g, '');
    const suffix = cleanCode.length > 4 ? cleanCode.slice(-4) : cleanCode;

    // Montagem: PREFIXO-MEDIDA-SUFIXO ou PREFIXO-SUFIXO
    const parts = [prefix, measure, suffix].filter(Boolean);
    return parts.join('-');
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

    // Tratamento de array unitário
    const detArray = Array.isArray(infNFe.det) ? infNFe.det : [infNFe.det];

    // Cálculo robusto do total (caso falte a tag <total>)
    const calculatedProductsTotal = detArray.reduce(
      (acc: number, curr: any) => {
        return acc + (Number(curr.prod?.vProd) || 0);
      },
      0,
    );

    const xmlTotal = Number(infNFe.total?.ICMSTot?.vNF);
    const finalTotalAmount =
      !isNaN(xmlTotal) && xmlTotal > 0 ? xmlTotal : calculatedProductsTotal;

    const nfeData = {
      accessKey: nfeProc?.protNFe?.infProt?.chNFe || '',
      number: infNFe.ide?.nNF,
      series: infNFe.ide?.serie,
      issueDate: infNFe.ide?.dhEmi,
      totalAmount: finalTotalAmount,
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

    const products: ParsedItem[] = await Promise.all(
      detArray.map(async (det: any, index: number) => {
        const prod = det.prod;
        const cProd = String(prod.cProd); // FIX: Converte forçadamente para String para evitar erro do Prisma com números (Ex: "96")

        // Verifica se já existe pelo código de fornecedor (cProd)
        const foundByCode =
          (await this.prisma.product.findFirst({
            where: { supplier: { supplierProductCode: cProd } }, // Ideal: Busca pelo código do fornecedor no relacionamento
            select: { id: true, sku: true },
          })) ||
          (await this.prisma.product.findFirst({
            where: { sku: cProd }, // Fallback: Busca pelo SKU direto
            select: { id: true, sku: true },
          }));

        // Gera SKU inteligente se não encontrou produto existente
        const smartSku = foundByCode
          ? foundByCode.sku
          : this.generateSmartSku(prod.xProd, cProd);

        return {
          index,
          code: smartSku, // SKU sugerido para o sistema (ex: SHA-500ML-1234)
          supplierCode: cProd, // Código original (ex: 1234)
          ean: prod.cEAN !== 'SEM GTIN' ? String(prod.cEAN) : null,
          name: prod.xProd,
          ncm: prod.NCM ? String(prod.NCM) : undefined,
          cfop: prod.CFOP ? String(prod.CFOP) : undefined,
          unit: prod.uCom,
          quantity: Number(prod.qCom) || 0,
          unitPrice: Number(prod.vUnCom) || 0,
          totalPrice: Number(prod.vProd) || undefined,
          suggestedAction: foundByCode ? 'LINK_EXISTING' : 'NEW',
          id: foundByCode ? foundByCode.id : null,
          suggestedTargetIndex: null,
        };
      }),
    );

    // Detecção de variantes (Agrupamento inteligente)
    for (let i = 0; i < products.length; i++) {
      const current = products[i];
      if (current.id) continue;

      for (let j = 0; j < i; j++) {
        const candidate = products[j];
        if (this.calculateSimilarity(current.name, candidate.name) > 0.8) {
          current.suggestedAction = 'LINK_XML_INDEX';
          current.suggestedTargetIndex = j;
          // Se for variante, sugere SKU seguindo o pai: PAI-VAR
          // Ex: Pai SHA-500ML-1234 -> Variante SHA-500ML-1234-V2 (Lógica simples, o usuário refina no front)
          current.code = `${candidate.code}-V${i}`;
          break;
        }
      }
    }

    return { nfe: nfeData, supplier: supplierData, products };
  }

  // -------------------- Importação (Core) --------------------
  async importNfe(payload: any, tenantId: string, user: User) {
    const { supplier, products, nfe, mappings, financial } = payload;
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

    // 4. Loop de Processamento (Mantido sem alterações na lógica de produtos)
    for (let i = 0; i < products.length; i++) {
      const item: ParsedItem = products[i];
      const mapping = mappings?.[item.index] ?? { action: 'NEW' };
      const defaultMarkupPct = mapping.markup ?? 100;

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

      if (mapping.action === 'NEW') {
        const isLeader = Object.values(mappings).some(
          (m: any) =>
            m.action === 'LINK_XML_INDEX' && m.targetIndex === item.index,
        );

        if (isLeader) {
          const cleanName = this.cleanProductName(item.name);
          const variantName =
            this.extractVariantName(item.name, cleanName) ?? item.name;

          const parentProduct = await this.productsService.create(
            {
              ...baseProductDto,
              name: cleanName,
              sku: this.generateSmartSku(cleanName, item.code),
              stock: null,
              prices: [],
              supplier: null,
            } as any,
            tenantId,
            user,
          );

          createdParentsMap[item.index] = parentProduct.id;

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
      } else if (mapping.action === 'LINK_XML_INDEX') {
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

    // 5. GERAÇÃO AUTOMÁTICA DE CONTAS A PAGAR (INTEGRAÇÃO ATUALIZADA)
    if (financial?.generate) {
      const totalAmount = Number(nfe.totalAmount) || 0;
      let installmentsPlan: any[] = [];
      const startDate: Date | string = new Date(); // Data base para cálculo (Hoje)

      // Se o frontend enviar um ID de PaymentTerm, passamos para o service
      const paymentTermId = financial.paymentTermId;

      // Se NÃO tiver paymentTermId, montamos o plano com base na configuração manual (fallback/A Combinar)
      if (!paymentTermId) {
        const entryAmount = Number(financial.entryAmount || 0);
        const installmentsCount = Number(financial.installmentsCount || 1);
        const daysInterval = Number(financial.daysInterval || 30);
        // Se houver data específica para primeira parcela, calculamos o delay em dias
        const firstDueDate = financial.firstDueDate
          ? new Date(financial.firstDueDate)
          : new Date();

        // 1. Regra da Entrada
        if (entryAmount > 0) {
          installmentsPlan.push({
            days: 0,
            fixedAmount: entryAmount,
            percent: 0,
          });
        }

        // 2. Regras das Parcelas (Restante)
        const remainingAmount = totalAmount - entryAmount;
        if (remainingAmount > 0 && installmentsCount > 0) {
          // Calcula a proporção de cada parcela em relação ao TOTAL da nota
          // O FinancialService usará essa % para calcular o valor
          const installmentValue = remainingAmount / installmentsCount;
          const installmentPercent = (installmentValue / totalAmount) * 100;

          // Calcula dias de atraso inicial (ex: user escolheu vencimento para daqui 15 dias)
          const diffTime = firstDueDate.getTime() - new Date().getTime();
          const startDelayDays = Math.ceil(diffTime / (1000 * 3600 * 24));
          const safeStartDelay = startDelayDays > 0 ? startDelayDays : 0;

          for (let i = 0; i < installmentsCount; i++) {
            installmentsPlan.push({
              days: safeStartDelay + i * daysInterval,
              percent: Number(installmentPercent.toFixed(4)),
            });
          }
        }
      }

      await this.financialService.generatePayablesFromImport(
        tenantId,
        user.id,
        {
          importId: nfe.accessKey || `NFE-${nfe.number}`,
          supplierId: supplierDb.id,
          totalAmount,
          invoiceNumber: String(nfe.number),
          paymentMethod: financial.paymentMethod,
          // Passamos o ID ou o Plano Manual construído
          paymentTermId,
          installmentsPlan,
          startDate,
        },
      );
    }
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
            create: {
              productId,
              priceListId: pl.id,
              price: newSellingPrice,
              tenantId,
            },
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

  // --- MÉTODOS DO INBOX ---

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
