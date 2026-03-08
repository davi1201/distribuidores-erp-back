// ============================================================================
// CONSTANTES GLOBAIS DO SISTEMA
// ============================================================================

// ---------------------------------------------------------------------------
// HTTP & API
// ---------------------------------------------------------------------------
export const HTTP_TIMEOUT = 30000; // 30 segundos
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;
export const MIN_PAGE = 1;

// ---------------------------------------------------------------------------
// Cache TTL (em segundos)
// ---------------------------------------------------------------------------
export const CACHE_TTL = {
  SHORT: 60, // 1 minuto
  MEDIUM: 300, // 5 minutos
  LONG: 900, // 15 minutos
  VERY_LONG: 3600, // 1 hora
  LOCATIONS: 86400, // 24 horas
  SYSTEM_CONFIG: 1800, // 30 minutos
} as const;

// ---------------------------------------------------------------------------
// Validação de Documentos
// ---------------------------------------------------------------------------
export const DOCUMENT_PATTERNS = {
  CPF: /^\d{11}$/,
  CNPJ: /^\d{14}$/,
  CPF_FORMATTED: /^\d{3}\.\d{3}\.\d{3}-\d{2}$/,
  CNPJ_FORMATTED: /^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/,
  PHONE: /^\d{10,11}$/,
  CEP: /^\d{8}$/,
} as const;

// ---------------------------------------------------------------------------
// Limites de Sistema
// ---------------------------------------------------------------------------
export const SYSTEM_LIMITS = {
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
  MAX_PRODUCTS_BATCH: 100,
  MAX_INSTALLMENTS: 48,
  SKU_LENGTH: 8,
  MIN_PASSWORD_LENGTH: 8,
  MAX_DESCRIPTION_LENGTH: 500,
  MAX_NAME_LENGTH: 255,
} as const;

// ---------------------------------------------------------------------------
// Valores Padrão
// ---------------------------------------------------------------------------
export const DEFAULTS = {
  CURRENCY: 'BRL',
  LOCALE: 'pt-BR',
  TIMEZONE: 'America/Sao_Paulo',
  UNIT: 'UN',
  NCM: '00000000',
  MARKUP_PERCENTAGE: 100,
  MIN_STOCK: 0,
  TRIAL_DAYS: 7,
} as const;

// ---------------------------------------------------------------------------
// Mensagens de Erro Padrão
// ---------------------------------------------------------------------------
export const ERROR_MESSAGES = {
  // Genéricos
  NOT_FOUND: (entity: string) => `${entity} não encontrado(a)`,
  ALREADY_EXISTS: (entity: string) => `${entity} já existe`,
  INVALID_DATA: 'Dados inválidos',
  UNAUTHORIZED: 'Não autorizado',
  FORBIDDEN: 'Acesso negado',
  INTERNAL_ERROR: 'Erro interno do servidor',

  // Tenant
  TENANT_REQUIRED: 'Organização não selecionada',
  TENANT_INACTIVE: 'Organização inativa',
  TENANT_NOT_FOUND: 'Organização não encontrada',

  // Autenticação
  INVALID_CREDENTIALS: 'Credenciais inválidas',
  SESSION_EXPIRED: 'Sessão expirada',
  TOKEN_INVALID: 'Token inválido',

  // Financeiro
  TITLE_ALREADY_PAID: 'Título já está pago',
  TITLE_CANCELLED: 'Título cancelado',
  PAYMENT_EXCEEDS_BALANCE: 'Valor do pagamento excede o saldo devedor',
  INVALID_AMOUNT: 'Valor deve ser maior que zero',

  // Estoque
  INSUFFICIENT_STOCK: 'Estoque insuficiente',
  WAREHOUSE_NOT_FOUND: 'Depósito não encontrado',
  PRODUCT_NOT_FOUND: 'Produto não encontrado',

  // Vendas
  ORDER_NOT_FOUND: 'Pedido não encontrado',
  ORDER_ALREADY_CANCELLED: 'Pedido já cancelado',
  CUSTOMER_REQUIRED: 'Cliente é obrigatório',
  EMPTY_ORDER: 'Pedido não pode estar vazio',
} as const;

// ---------------------------------------------------------------------------
// Mensagens de Sucesso
// ---------------------------------------------------------------------------
export const SUCCESS_MESSAGES = {
  CREATED: (entity: string) => `${entity} criado(a) com sucesso`,
  UPDATED: (entity: string) => `${entity} atualizado(a) com sucesso`,
  DELETED: (entity: string) => `${entity} removido(a) com sucesso`,
  LOGIN_SUCCESS: 'Login realizado com sucesso',
  LOGOUT_SUCCESS: 'Logout realizado com sucesso',
  PAYMENT_REGISTERED: 'Pagamento registrado com sucesso',
} as const;

// ---------------------------------------------------------------------------
// Nomes de Entidades (para logs e mensagens)
// ---------------------------------------------------------------------------
export const ENTITY_NAMES = {
  USER: 'Usuário',
  CUSTOMER: 'Cliente',
  SUPPLIER: 'Fornecedor',
  PRODUCT: 'Produto',
  ORDER: 'Pedido',
  FINANCIAL_TITLE: 'Título financeiro',
  WAREHOUSE: 'Depósito',
  STOCK_MOVEMENT: 'Movimentação de estoque',
  STOCK_TRANSFER: 'Transferência',
  COMMISSION: 'Comissão',
  CATEGORY: 'Categoria',
  PRICE_LIST: 'Lista de preços',
  PAYMENT_METHOD: 'Método de pagamento',
  PAYMENT_TERM: 'Condição de pagamento',
  BANK_ACCOUNT: 'Conta bancária',
  TENANT: 'Organização',
  PLAN: 'Plano',
  TAX_PROFILE: 'Perfil tributário',
  NFE: 'Nota fiscal',
  TEAM_INVITE: 'Convite',
  STATE: 'Estado',
  CITY: 'Cidade',
} as const;

// ---------------------------------------------------------------------------
// Regex Patterns Reutilizáveis
// ---------------------------------------------------------------------------
export const REGEX_PATTERNS = {
  // Documentos Brasil
  CPF_ONLY_NUMBERS: /^\d{11}$/,
  CNPJ_ONLY_NUMBERS: /^\d{14}$/,
  CPF_OR_CNPJ: /^(\d{11}|\d{14})$/,

  // Telefone
  PHONE_BR: /^(\d{10}|\d{11})$/,
  CELLPHONE_BR: /^\d{11}$/,

  // CEP
  CEP: /^\d{8}$/,
  CEP_FORMATTED: /^\d{5}-\d{3}$/,

  // Email
  EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,

  // SKU/Códigos
  SKU: /^[A-Z0-9\-]{3,20}$/,
  EAN: /^\d{8}|\d{13}$/,
  NCM: /^\d{8}$/,

  // Slugs e URLs
  SLUG: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,

  // UUID
  UUID: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
} as const;
