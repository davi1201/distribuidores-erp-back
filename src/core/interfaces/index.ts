// ============================================================================
// COMMON INTERFACES - Interfaces tipadas reutilizáveis
// ============================================================================

import { Decimal } from '@prisma/client/runtime/library';

// ---------------------------------------------------------------------------
// Base Interfaces
// ---------------------------------------------------------------------------

/**
 * Interface base para entidades com tenant
 */
export interface TenantEntity {
  id: string;
  tenantId: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Interface para paginação
 */
export interface PaginationParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

/**
 * Interface para resposta paginada
 */
export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/**
 * Interface para filtros de busca
 */
export interface SearchFilters {
  search?: string;
  startDate?: Date;
  endDate?: Date;
  isActive?: boolean;
}

// ---------------------------------------------------------------------------
// User & Auth Interfaces
// ---------------------------------------------------------------------------

/**
 * Contexto do usuário autenticado
 */
export interface AuthUser {
  userId: string;
  email: string;
  name: string;
  role: 'ADMIN' | 'OWNER' | 'MANAGER' | 'SELLER';
  tenantId: string | null;
  tenantName?: string;
  permissions?: string[];
}

/**
 * Contexto de requisição
 */
export interface RequestContext {
  user: AuthUser;
  requestId: string;
  ip: string;
  userAgent: string;
}

// ---------------------------------------------------------------------------
// Financial Interfaces
// ---------------------------------------------------------------------------

/**
 * Título financeiro
 */
export interface FinancialTitle {
  id: string;
  tenantId: string;
  type: 'RECEIVABLE' | 'PAYABLE';
  status: 'PENDING' | 'PAID' | 'OVERDUE' | 'CANCELLED';
  amount: Decimal;
  balance: Decimal;
  dueDate: Date;
  paidAt?: Date;
  customerId?: string;
  supplierId?: string;
  orderId?: string;
}

/**
 * Pagamento
 */
export interface PaymentData {
  amount: number;
  method: string;
  installments?: number;
  paidAt?: Date;
}

/**
 * Regra de parcelamento
 */
export interface InstallmentRule {
  days: number;
  percent: number;
  fixedAmount?: number;
}

// ---------------------------------------------------------------------------
// Order Interfaces
// ---------------------------------------------------------------------------

/**
 * Item de pedido
 */
export interface OrderItem {
  id: string;
  productId: string;
  quantity: Decimal | number;
  unitPrice: Decimal | number;
  totalPrice: Decimal | number;
  discount?: Decimal | number;
  product?: {
    id: string;
    name: string;
    sku?: string;
    categoryId?: string;
  };
}

/**
 * Pedido
 */
export interface Order {
  id: string;
  tenantId: string;
  customerId: string;
  sellerId: string;
  status:
    | 'DRAFT'
    | 'PENDING'
    | 'CONFIRMED'
    | 'SHIPPED'
    | 'DELIVERED'
    | 'CANCELLED';
  subtotal: Decimal;
  discount: Decimal;
  shipping: Decimal;
  total: Decimal;
  items: OrderItem[];
  createdAt: Date;
}

// ---------------------------------------------------------------------------
// Product Interfaces
// ---------------------------------------------------------------------------

/**
 * Produto para venda
 */
export interface SellableProduct {
  id: string;
  name: string;
  sku: string;
  price: number;
  stock: number;
  unit: string;
  isActive: boolean;
}

/**
 * Movimento de estoque
 */
export interface StockMovement {
  id: string;
  productId: string;
  warehouseId: string;
  type: 'IN' | 'OUT' | 'ADJUSTMENT' | 'TRANSFER';
  quantity: number;
  reason?: string;
  referenceId?: string;
}

// ---------------------------------------------------------------------------
// Commission Interfaces
// ---------------------------------------------------------------------------

/**
 * Regra de comissão
 */
export interface CommissionRule {
  id: string;
  tenantId: string;
  sellerId?: string;
  categoryId?: string;
  productId?: string;
  type: 'PERCENTAGE' | 'FIXED_PER_UNIT' | 'FIXED_PER_ORDER';
  scope: 'PRODUCT' | 'CATEGORY' | 'ORDER';
  percentage?: number;
  fixedValue?: number;
  isActive: boolean;
  priority: number;
}

/**
 * Registro de comissão
 */
export interface CommissionRecord {
  id: string;
  tenantId: string;
  sellerId: string;
  orderId: string;
  status: 'PENDING' | 'APPROVED' | 'PAID' | 'CANCELLED';
  calculationBase: Decimal;
  appliedPercentage: Decimal;
  commissionAmount: Decimal;
  referenceDate: Date;
  dueDate: Date;
}

// ---------------------------------------------------------------------------
// NFe Interfaces
// ---------------------------------------------------------------------------

/**
 * Produto extraído da NFe
 */
export interface NfeProduct {
  code: string;
  ean?: string | null;
  name: string;
  ncm?: string;
  cfop?: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  totalPrice?: number;
  suggestedAction: 'LINK_EXISTING' | 'NEW';
  id?: string | null;
  suggestedTargetIndex?: number | null;
}

/**
 * Resultado do parse de NFe
 */
export interface NfeParseResult {
  supplier: {
    cnpj: string;
    name: string;
    tradeName?: string;
    address?: string;
    city?: string;
    state?: string;
  };
  invoice: {
    number: string;
    series: string;
    issueDate: Date;
    accessKey: string;
    total: number;
  };
  products: NfeProduct[];
}

// ---------------------------------------------------------------------------
// Dashboard Interfaces
// ---------------------------------------------------------------------------

/**
 * Filtros do dashboard
 */
export interface DashboardFilters {
  tenantId: string;
  userId: string;
  role: string;
  startDate?: Date;
  endDate?: Date;
  sellerId?: string;
}

/**
 * Dados do dashboard
 */
export interface DashboardData {
  summary: {
    totalSales: number;
    totalOrders: number;
    averageTicket: number;
    pendingOrders: number;
  };
  recentOrders: Order[];
  topProducts: Array<{
    productId: string;
    name: string;
    quantity: number;
    revenue: number;
  }>;
  salesByCategory: Array<{
    categoryId: string;
    name: string;
    total: number;
  }>;
}

// ---------------------------------------------------------------------------
// API Response Interfaces
// ---------------------------------------------------------------------------

/**
 * Resposta padrão de API
 */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/**
 * Resposta de erro
 */
export interface ApiError {
  statusCode: number;
  message: string;
  error?: string;
  details?: Record<string, unknown>;
  timestamp: string;
  path: string;
}
