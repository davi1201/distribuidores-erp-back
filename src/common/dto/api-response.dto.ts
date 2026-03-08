// ============================================================================
// API RESPONSE DTOs - Respostas padronizadas para Swagger
// ============================================================================

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTO de paginação
 */
export class PaginationMetaDto {
  @ApiProperty({ description: 'Página atual', example: 1 })
  page: number;

  @ApiProperty({ description: 'Itens por página', example: 20 })
  limit: number;

  @ApiProperty({ description: 'Total de itens', example: 150 })
  total: number;

  @ApiProperty({ description: 'Total de páginas', example: 8 })
  totalPages: number;
}

/**
 * DTO de resposta de sucesso
 */
export class ApiSuccessResponseDto<T = unknown> {
  @ApiProperty({ description: 'Indica sucesso', example: true })
  success: boolean;

  @ApiPropertyOptional({ description: 'Mensagem de sucesso' })
  message?: string;

  @ApiProperty({ description: 'Dados retornados' })
  data: T;

  @ApiPropertyOptional({
    description: 'Metadados de paginação',
    type: PaginationMetaDto,
  })
  pagination?: PaginationMetaDto;
}

/**
 * DTO de resposta de erro
 */
export class ApiErrorResponseDto {
  @ApiProperty({ description: 'Indica falha', example: false })
  success: boolean;

  @ApiProperty({ description: 'Código HTTP', example: 400 })
  statusCode: number;

  @ApiProperty({ description: 'Mensagem de erro', example: 'Dados inválidos' })
  message: string;

  @ApiPropertyOptional({ description: 'Erro técnico', example: 'Bad Request' })
  error?: string;

  @ApiProperty({
    description: 'Timestamp',
    example: '2024-03-07T12:00:00.000Z',
  })
  timestamp: string;

  @ApiProperty({
    description: 'Path da requisição',
    example: '/api/v1/customers',
  })
  path: string;
}

/**
 * DTO de resposta de lista
 */
export class ApiListResponseDto<T = unknown> {
  @ApiProperty({ description: 'Indica sucesso', example: true })
  success: boolean;

  @ApiProperty({ description: 'Lista de itens', isArray: true })
  data: T[];

  @ApiProperty({ description: 'Total de itens', example: 50 })
  total: number;
}

/**
 * DTO de resposta de criação
 */
export class ApiCreateResponseDto<T = unknown> {
  @ApiProperty({ description: 'Indica sucesso', example: true })
  success: boolean;

  @ApiProperty({
    description: 'Mensagem de sucesso',
    example: 'Item criado com sucesso',
  })
  message: string;

  @ApiProperty({ description: 'Item criado' })
  data: T;
}

/**
 * DTO de resposta de exclusão
 */
export class ApiDeleteResponseDto {
  @ApiProperty({ description: 'Indica sucesso', example: true })
  success: boolean;

  @ApiProperty({
    description: 'Mensagem de sucesso',
    example: 'Item excluído com sucesso',
  })
  message: string;
}

// ---------------------------------------------------------------------------
// DTOs de Entidades
// ---------------------------------------------------------------------------

/**
 * DTO base de entidade
 */
export class BaseEntityDto {
  @ApiProperty({ description: 'ID único', example: 'clx1y2z3a4b5c6d7e8f9g0h1' })
  id: string;

  @ApiProperty({ description: 'Data de criação' })
  createdAt: Date;

  @ApiProperty({ description: 'Data de atualização' })
  updatedAt: Date;
}

/**
 * DTO de cliente
 */
export class CustomerDto extends BaseEntityDto {
  @ApiProperty({ description: 'Nome do cliente', example: 'João Silva' })
  name: string;

  @ApiProperty({ description: 'CPF/CNPJ', example: '12345678900' })
  document: string;

  @ApiPropertyOptional({ description: 'Email', example: 'joao@email.com' })
  email?: string;

  @ApiPropertyOptional({ description: 'Telefone', example: '11999999999' })
  phone?: string;
}

/**
 * DTO de produto
 */
export class ProductDto extends BaseEntityDto {
  @ApiProperty({ description: 'Nome do produto', example: 'Camiseta Básica' })
  name: string;

  @ApiProperty({ description: 'SKU', example: 'CAM-001' })
  sku: string;

  @ApiProperty({ description: 'Preço de venda', example: 49.9 })
  price: number;

  @ApiProperty({ description: 'Estoque disponível', example: 100 })
  stock: number;

  @ApiProperty({ description: 'Produto ativo', example: true })
  isActive: boolean;
}

/**
 * DTO de pedido
 */
export class OrderDto extends BaseEntityDto {
  @ApiProperty({ description: 'Número do pedido', example: 1001 })
  orderNumber: number;

  @ApiProperty({ description: 'Status', example: 'PENDING' })
  status: string;

  @ApiProperty({ description: 'Subtotal', example: 150.0 })
  subtotal: number;

  @ApiProperty({ description: 'Desconto', example: 10.0 })
  discount: number;

  @ApiProperty({ description: 'Frete', example: 15.0 })
  shipping: number;

  @ApiProperty({ description: 'Total', example: 155.0 })
  total: number;
}
