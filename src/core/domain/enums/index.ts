// ============================================================================
// ENUMS CENTRALIZADOS - Substituem todas as magic strings do projeto
// ============================================================================

// ---------------------------------------------------------------------------
// Roles e Permissões
// ---------------------------------------------------------------------------
export enum UserRole {
  SUPER_ADMIN = 'SUPER_ADMIN',
  OWNER = 'OWNER',
  ADMIN = 'ADMIN',
  MANAGER = 'MANAGER',
  SELLER = 'SELLER',
  SUPPORT = 'SUPPORT',
}

export const OWNER_ROLES = [UserRole.SUPER_ADMIN, UserRole.OWNER] as const;
export const ADMIN_ROLES = [
  UserRole.SUPER_ADMIN,
  UserRole.OWNER,
  UserRole.ADMIN,
] as const;
export const MANAGER_ROLES = [...ADMIN_ROLES, UserRole.MANAGER] as const;
export const ALL_ROLES = Object.values(UserRole);

// ---------------------------------------------------------------------------
// Títulos Financeiros
// ---------------------------------------------------------------------------
export enum TitleType {
  RECEIVABLE = 'RECEIVABLE',
  PAYABLE = 'PAYABLE',
}

export enum TitleStatus {
  PENDING = 'PENDING',
  PARTIAL = 'PARTIAL',
  PAID = 'PAID',
  OVERDUE = 'OVERDUE',
  CANCELLED = 'CANCELLED',
}

export enum TitleOrigin {
  MANUAL = 'MANUAL',
  SALE = 'SALE',
  NFE_IMPORT = 'NFE_IMPORT',
  COMMISSION = 'COMMISSION',
  RECURRENCE = 'RECURRENCE',
}

export enum MovementType {
  PAYMENT = 'PAYMENT',
  RECEIPT = 'RECEIPT',
  ADJUSTMENT = 'ADJUSTMENT',
  REVERSAL = 'REVERSAL',
  DISCOUNT = 'DISCOUNT',
  INTEREST = 'INTEREST',
  FINE = 'FINE',
}

export enum CategoryType {
  RECEIVABLE = 'RECEIVABLE',
  PAYABLE = 'PAYABLE',
}

// ---------------------------------------------------------------------------
// Estoque
// ---------------------------------------------------------------------------
export enum StockMovementType {
  IN = 'IN',
  OUT = 'OUT',
  ADJUSTMENT = 'ADJUSTMENT',
  TRANSFER_IN = 'TRANSFER_IN',
  TRANSFER_OUT = 'TRANSFER_OUT',
  SALE = 'SALE',
  PURCHASE = 'PURCHASE',
  RETURN = 'RETURN',
  LOSS = 'LOSS',
}

export enum StockMovementReason {
  PURCHASE = 'PURCHASE',
  SALE = 'SALE',
  ADJUSTMENT = 'ADJUSTMENT',
  TRANSFER = 'TRANSFER',
  RETURN = 'RETURN',
  LOSS = 'LOSS',
  NFE_IMPORT = 'NFE_IMPORT',
  MANUAL = 'MANUAL',
}

export enum TransferStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  IN_TRANSIT = 'IN_TRANSIT',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

// ---------------------------------------------------------------------------
// Vendas / Pedidos
// ---------------------------------------------------------------------------
export enum OrderStatus {
  DRAFT = 'DRAFT',
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  PROCESSING = 'PROCESSING',
  SHIPPED = 'SHIPPED',
  DELIVERED = 'DELIVERED',
  CANCELLED = 'CANCELLED',
  RETURNED = 'RETURNED',
}

export enum PaymentStatus {
  PENDING = 'PENDING',
  PARTIAL = 'PARTIAL',
  PAID = 'PAID',
  REFUNDED = 'REFUNDED',
  FAILED = 'FAILED',
}

// ---------------------------------------------------------------------------
// Métodos de Pagamento
// ---------------------------------------------------------------------------
export enum PaymentMethodCode {
  CASH = 'CASH',
  PIX = 'PIX',
  BOLETO = 'BOLETO',
  CREDIT_CARD = 'CREDIT_CARD',
  DEBIT_CARD = 'DEBIT_CARD',
  BANK_TRANSFER = 'BANK_TRANSFER',
  CHECK = 'CHECK',
  PROMISSORY = 'PROMISSORY',
}

export enum PixKeyType {
  CPF = 'CPF',
  CNPJ = 'CNPJ',
  EMAIL = 'EMAIL',
  PHONE = 'PHONE',
  EVP = 'EVP',
}

// ---------------------------------------------------------------------------
// Comissões
// ---------------------------------------------------------------------------
export enum CommissionScope {
  GLOBAL = 'GLOBAL',
  USER = 'USER',
  PRODUCT = 'PRODUCT',
  CATEGORY = 'CATEGORY',
}

export enum CommissionType {
  PERCENTAGE = 'PERCENTAGE',
  FIXED = 'FIXED',
}

export enum CommissionStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  PAID = 'PAID',
  CANCELLED = 'CANCELLED',
}

// ---------------------------------------------------------------------------
// NFe
// ---------------------------------------------------------------------------
export enum NfeStatus {
  PENDING = 'PENDING',
  IMPORTED = 'IMPORTED',
  IGNORED = 'IGNORED',
  ERROR = 'ERROR',
}

export enum NfeProductAction {
  LINK = 'link',
  CREATE = 'create',
  SKIP = 'skip',
  REVIEW = 'review',
}

// ---------------------------------------------------------------------------
// Asaas
// ---------------------------------------------------------------------------
export enum AsaasAccountStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  AWAITING_ACTION = 'AWAITING_ACTION',
  DENIED = 'DENIED',
}

export enum AsaasBillingType {
  BOLETO = 'BOLETO',
  PIX = 'PIX',
  CREDIT_CARD = 'CREDIT_CARD',
}

export enum AsaasTransferType {
  PIX = 'PIX',
  TED = 'TED',
}

// ---------------------------------------------------------------------------
// Webhook Events
// ---------------------------------------------------------------------------
export enum ClerkEventType {
  USER_CREATED = 'user.created',
  USER_UPDATED = 'user.updated',
  USER_DELETED = 'user.deleted',
  ORGANIZATION_CREATED = 'organization.created',
  ORGANIZATION_UPDATED = 'organization.updated',
  ORGANIZATION_DELETED = 'organization.deleted',
  ORGANIZATION_MEMBERSHIP_CREATED = 'organizationMembership.created',
  ORGANIZATION_MEMBERSHIP_DELETED = 'organizationMembership.deleted',
}

export enum AsaasEventType {
  PAYMENT_RECEIVED = 'PAYMENT_RECEIVED',
  PAYMENT_CONFIRMED = 'PAYMENT_CONFIRMED',
  PAYMENT_OVERDUE = 'PAYMENT_OVERDUE',
  PAYMENT_DELETED = 'PAYMENT_DELETED',
  PAYMENT_REFUNDED = 'PAYMENT_REFUNDED',
  TRANSFER_CREATED = 'TRANSFER_CREATED',
  TRANSFER_DONE = 'TRANSFER_DONE',
}

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------
export enum AuditAction {
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
  LOGIN = 'LOGIN',
  LOGOUT = 'LOGOUT',
  VIEW = 'VIEW',
  EXPORT = 'EXPORT',
  IMPORT = 'IMPORT',
}

// ---------------------------------------------------------------------------
// Messages / Notifications
// ---------------------------------------------------------------------------
export enum NotificationChannel {
  PUSH = 'PUSH',
  EMAIL = 'EMAIL',
  SMS = 'SMS',
  IN_APP = 'IN_APP',
}

export enum NotificationType {
  INFO = 'INFO',
  WARNING = 'WARNING',
  ERROR = 'ERROR',
  SUCCESS = 'SUCCESS',
}
