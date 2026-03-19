import { BaseRepository } from './base.repository';

// ============================================================================
// ENTIDADE DE PRODUTO (Domain Entity)
// ============================================================================
export interface ProductEntity {
  id: string;
  tenantId: string;
  name: string;
  sku: string;
  ean: string | null;
  description: string | null;
  unit: string;
  ncmCode: string;
  cestCode: string | null;
  cfopCode: string | null;
  costPrice: number;
  salePrice: number;
  minStock: number;
  maxStock: number;
  weight: number | null;
  width: number | null;
  height: number | null;
  depth: number | null;
  categoryId: string | null;
  taxProfileId: string | null;
  isActive: boolean;
  isSellable: boolean;
  isPurchasable: boolean;
  createdAt: Date;
  updatedAt: Date;
  // Relations
  category?: { id: string; name: string } | null;
  taxProfile?: { id: string; name: string } | null;
  stockItems?: StockItemEntity[];
  prices?: ProductPriceEntity[];
}

export interface StockItemEntity {
  productId: string;
  warehouseId: string;
  quantity: number;
  reservedQuantity: number;
  availableQuantity: number;
}

export interface ProductPriceEntity {
  id: string;
  productId: string;
  priceListId: string;
  price: number;
  minQuantity: number;
  isActive: boolean;
}

// ============================================================================
// INPUTS
// ============================================================================
export interface CreateProductInput {
  tenantId: string;
  name: string;
  sku?: string;
  ean?: string;
  description?: string;
  unit?: string;
  ncmCode?: string;
  cestCode?: string;
  cfopCode?: string;
  costPrice: number;
  salePrice?: number;
  minStock?: number;
  maxStock?: number;
  weight?: number;
  width?: number;
  height?: number;
  depth?: number;
  categoryId?: string;
  taxProfileId?: string;
  isActive?: boolean;
  isSellable?: boolean;
  isPurchasable?: boolean;
}

export interface UpdateProductInput {
  name?: string;
  sku?: string;
  ean?: string;
  description?: string;
  unit?: string;
  ncmCode?: string;
  cestCode?: string;
  cfopCode?: string;
  costPrice?: number;
  salePrice?: number;
  minStock?: number;
  maxStock?: number;
  categoryId?: string;
  taxProfileId?: string;
  isActive?: boolean;
  isSellable?: boolean;
  isPurchasable?: boolean;
}

// ============================================================================
// FILTROS
// ============================================================================
export interface ProductFilter {
  tenantId: string;
  categoryId?: string;
  isActive?: boolean;
  isSellable?: boolean;
  search?: string;
  sku?: string;
  ean?: string;
}

// ============================================================================
// INTERFACE DO REPOSITÓRIO
// ============================================================================
export abstract class ProductRepository extends BaseRepository<
  ProductEntity,
  CreateProductInput,
  UpdateProductInput,
  ProductFilter
> {
  abstract findBySku(
    tenantId: string,
    sku: string,
  ): Promise<ProductEntity | null>;
  abstract findByEan(
    tenantId: string,
    ean: string,
  ): Promise<ProductEntity | null>;
  abstract findSellable(tenantId: string): Promise<ProductEntity[]>;
  abstract findWithStock(
    tenantId: string,
    warehouseId?: string,
  ): Promise<ProductEntity[]>;
  abstract findWithPrices(
    tenantId: string,
    priceListId: string,
  ): Promise<ProductEntity[]>;
  abstract updateStock(
    productId: string,
    warehouseId: string,
    quantity: number,
    reserved?: number,
  ): Promise<void>;
}
