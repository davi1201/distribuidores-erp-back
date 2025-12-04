import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { customAlphabet } from 'nanoid';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { User } from '@prisma/client';
import { CalculatePriceDto } from './dto/calculate-price.dto';

const generateSku = customAlphabet('123456789ABCDEFGHJKLMNPQRSTUVWXYZ', 8);

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}
  // --- CREATE COM RASTREABILIDADE ---
  async create(createDto: CreateProductDto, tenantId: string, user: User) {
    let finalSku = createDto.sku;

    if (!finalSku) {
      finalSku = `PROD-${generateSku()}`;
    } else {
      finalSku = finalSku.toUpperCase();
    }

    const skuExists = await this.prisma.product.findUnique({
      where: { sku: finalSku },
    });

    if (skuExists && skuExists.tenantId === tenantId) {
      throw new BadRequestException('SKU já existente neste tenant.');
    }

    const { images, prices, stock, ...productData } = createDto;

    const sanitizedData = {
      ...productData,
      sku: finalSku, // garante que sku é sempre string
      taxProfileId: productData.taxProfileId || null,
      parentId: productData.parentId || null,
    };

    return this.prisma.$transaction(async (tx) => {
      // 1. Cria o Produto
      const product = await tx.product.create({
        data: {
          ...sanitizedData,
          tenantId,
          images: {
            create: images?.map((img) => ({
              url: img.url,
              order: img.order || 0,
            })),
          },
        },
      });

      // 2. Cria o Item de Estoque (Configurações + Saldo Inicial)
      const initialQty = Number(stock?.quantity || 0);

      await tx.stockItem.create({
        data: {
          productId: product.id,
          quantity: initialQty, // Define o saldo inicial
          minStock: stock?.minStock || 0,
          maxStock: stock?.maxStock,
        },
      });

      // 3. GERAR HISTÓRICO DE SALDO INICIAL (KARDEX)
      // Se houve entrada de saldo inicial, precisamos registrar "de onde veio" esse número.
      if (initialQty > 0) {
        await tx.stockMovement.create({
          data: {
            tenantId,
            productId: product.id,
            type: 'ENTRY', // Movimentação de Entrada
            quantity: initialQty,
            reason: 'Saldo Inicial (Cadastro de Produto)',
            costPrice: product.costPrice,
            balanceAfter: initialQty,
            userId: user.id,
          },
        });
      }

      // 4. Preços Iniciais
      if (prices && prices.length > 0) {
        for (const p of prices) {
          await tx.productPrice.create({
            data: {
              productId: product.id,
              priceListId: p.priceListId,
              price: p.price,
            },
          });

          await tx.productPriceHistory.create({
            data: {
              productId: product.id,
              priceListId: p.priceListId,
              oldPrice: 0,
              newPrice: p.price,
              reason: 'Cadastro Inicial',
              changedBy: user.id,
            },
          });
        }
      }

      return product;
    });
  }

  // --- UPDATE BLINDADO (NÃO ALTERA SALDO) ---
  async update(
    id: string,
    updateDto: UpdateProductDto,
    tenantId: string,
    user: User,
  ) {
    const product = await this.findOne(id, tenantId);

    const { images, prices, stock, changeReason, ...productData } = updateDto;

    const sanitizedData = {
      ...productData,
      taxProfileId: productData.taxProfileId || null,
      parentId: productData.parentId || null,
    };

    return this.prisma.$transaction(async (tx) => {
      // 1. Atualiza dados básicos
      await tx.product.update({
        where: { id },
        data: sanitizedData,
      });

      // 2. Atualiza CONFIGURAÇÕES de Estoque (Mínimo/Máximo)
      // IMPORTANTE: Ignoramos 'quantity' aqui propositalmente para garantir a rastreabilidade.
      // Movimentações de saldo devem ser feitas exclusivamente via StockService.
      if (stock) {
        const existingStock = await tx.stockItem.findFirst({
          where: { productId: id },
        });

        if (existingStock) {
          await tx.stockItem.update({
            where: { id: existingStock.id },
            data: {
              // quantity: stock.quantity, <--- REMOVIDO! Não atualizamos saldo aqui.
              minStock: stock.minStock,
              maxStock: stock.maxStock,
            },
          });
        } else {
          // Se não existia, cria zerado apenas com as configs
          await tx.stockItem.create({
            data: {
              productId: id,
              quantity: 0, // Nasce zerado se criado no update
              minStock: stock.minStock || 0,
              maxStock: stock.maxStock,
            },
          });
        }
      }

      // 3. Atualiza Imagens
      if (images) {
        await tx.productImage.deleteMany({ where: { productId: id } });
        await tx.productImage.createMany({
          data: images.map((img) => ({
            productId: id,
            url: img.url,
            order: img.order || 0,
          })),
        });
      }

      // 4. Atualiza Preços (Com Histórico)
      if (prices) {
        for (const p of prices) {
          const currentPriceObj = await tx.productPrice.findUnique({
            where: {
              productId_priceListId: {
                productId: id,
                priceListId: p.priceListId,
              },
            },
          });

          const currentPriceVal = currentPriceObj
            ? Number(currentPriceObj.price)
            : 0;
          const newPriceVal = Number(p.price);

          if (currentPriceVal !== newPriceVal) {
            await tx.productPrice.upsert({
              where: {
                productId_priceListId: {
                  productId: id,
                  priceListId: p.priceListId,
                },
              },
              update: { price: newPriceVal },
              create: {
                productId: id,
                priceListId: p.priceListId,
                price: newPriceVal,
              },
            });

            await tx.productPriceHistory.create({
              data: {
                productId: id,
                priceListId: p.priceListId,
                oldPrice: currentPriceVal,
                newPrice: newPriceVal,
                reason: changeReason || 'Alteração manual',
                changedBy: user.id,
              },
            });
          }
        }
      }

      return this.findOne(id, tenantId);
    });
  }

  // --- FIND ONE (Mantido para suportar o retorno correto) ---
  async findOne(id: string, tenantId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: {
        images: { orderBy: { order: 'asc' } },
        stock: true,
        prices: true,
        taxProfile: true,
        variants: {
          include: { stock: true, prices: true },
        },
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
      stock: stockItem,
    };
  }

  // --- FIND ALL (Mantido para lista) ---
  async findAll(tenantId: string) {
    const products = await this.prisma.product.findMany({
      where: { tenantId, parentId: null },
      include: {
        stock: true,
        images: { orderBy: { order: 'asc' }, take: 1 },
        prices: { include: { priceList: true } },
        variants: {
          include: { stock: true },
        },
      },
      orderBy: { name: 'asc' },
    });

    return products.map((product) => {
      const parentQty = Number(product.stock?.[0]?.quantity || 0);

      const variantsQty = product.variants.reduce((acc, v) => {
        const vQty = Number(v.stock?.[0]?.quantity || 0);
        return acc + vQty;
      }, 0);

      return {
        ...product,
        totalStock: parentQty + variantsQty,
      };
    });
  }

  async calculatePricing(dto: CalculatePriceDto, tenantId: string) {
    const { costPrice, expenses, markup, taxProfileId, destinationState } = dto;

    // 1. Valores Iniciais
    const cost = Number(costPrice);
    const expensesPct = Number(expenses);
    const markupPct = Number(markup);

    // 2. Busca Regras Fiscais (se houver perfil)
    let icmsRate = 0;
    let pisRate = 0;
    let cofinsRate = 0;
    let ipiRate = 0;
    let activeRuleName = 'Sem Perfil Tributário';

    if (taxProfileId) {
      const profile = await this.prisma.taxProfile.findUnique({
        where: { id: taxProfileId },
        include: { rules: true },
      });

      if (profile && profile.rules.length > 0) {
        // Tenta achar a regra específica para o destino
        let rule = profile.rules.find(
          (r) => r.destinationState === destinationState,
        );

        // Se não achou ou não foi informado destino, pega a primeira (fallback)
        if (!rule) {
          // Tenta pegar regra interna (Origem = Destino) como padrão
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

    // 3. Cálculo Matemático (Mark-up Divisor "Por Dentro")
    const taxesTotalPct = icmsRate + pisRate + cofinsRate + ipiRate;
    const totalDeductionsPct = taxesTotalPct + expensesPct;

    // A. Lucro (R$)
    const profitValue = cost * (markupPct / 100);

    // B. Líquido Necessário
    const netValueRequired = cost + profitValue;

    // C. Divisor (1 - Taxas)
    const divisor = (100 - totalDeductionsPct) / 100;

    // D. Preço Final
    const finalPrice = divisor > 0 ? netValueRequired / divisor : 0;

    // 4. Detalhamento em Reais (para o frontend mostrar)
    const taxValues = {
      icms: finalPrice * (icmsRate / 100),
      pis: finalPrice * (pisRate / 100),
      cofins: finalPrice * (cofinsRate / 100),
      ipi: finalPrice * (ipiRate / 100),
      others: finalPrice * (expensesPct / 100),
      totalTaxes: finalPrice * (taxesTotalPct / 100),
    };

    return {
      basePrice: Math.round(finalPrice * 100) / 100, // Arredondado
      calculationDetails: {
        cost,
        profitValue,
        netValueRequired,
        totalDeductionsPct,
        activeRuleName,
        taxValues,
        rates: { icmsRate, pisRate, cofinsRate, ipiRate, expensesPct },
      },
    };
  }

  // --- REMOVE ---
  async remove(id: string, tenantId: string) {
    await this.findOne(id, tenantId);
    return this.prisma.product.delete({ where: { id } });
  }
}
