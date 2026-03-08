// ============================================================================
// SWAGGER DECORATORS - Decorators customizados para documentação
// ============================================================================

import { applyDecorators, Type } from '@nestjs/common';
import {
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiProperty,
  ApiBearerAuth,
  ApiQuery,
  ApiParam,
} from '@nestjs/swagger';
import { ApiErrorResponseDto } from '../dto/api-response.dto';

// ---------------------------------------------------------------------------
// Decorators de Operação
// ---------------------------------------------------------------------------

/**
 * Decorator para endpoint de criação
 */
export function ApiCreate(summary: string, responseType?: Type<unknown>) {
  return applyDecorators(
    ApiOperation({ summary }),
    ApiBearerAuth(),
    ApiResponse({
      status: 201,
      description: 'Criado com sucesso',
      type: responseType,
    }),
    ApiResponse({
      status: 400,
      description: 'Dados inválidos',
      type: ApiErrorResponseDto,
    }),
    ApiResponse({
      status: 401,
      description: 'Não autorizado',
      type: ApiErrorResponseDto,
    }),
  );
}

/**
 * Decorator para endpoint de listagem
 */
export function ApiList(summary: string, responseType?: Type<unknown>) {
  return applyDecorators(
    ApiOperation({ summary }),
    ApiBearerAuth(),
    ApiResponse({
      status: 200,
      description: 'Lista retornada com sucesso',
      type: responseType,
      isArray: true,
    }),
    ApiResponse({
      status: 401,
      description: 'Não autorizado',
      type: ApiErrorResponseDto,
    }),
  );
}

/**
 * Decorator para endpoint de busca por ID
 */
export function ApiGetById(summary: string, responseType?: Type<unknown>) {
  return applyDecorators(
    ApiOperation({ summary }),
    ApiBearerAuth(),
    ApiParam({ name: 'id', description: 'ID do recurso' }),
    ApiResponse({
      status: 200,
      description: 'Recurso encontrado',
      type: responseType,
    }),
    ApiResponse({
      status: 404,
      description: 'Não encontrado',
      type: ApiErrorResponseDto,
    }),
    ApiResponse({
      status: 401,
      description: 'Não autorizado',
      type: ApiErrorResponseDto,
    }),
  );
}

/**
 * Decorator para endpoint de atualização
 */
export function ApiUpdate(summary: string, responseType?: Type<unknown>) {
  return applyDecorators(
    ApiOperation({ summary }),
    ApiBearerAuth(),
    ApiParam({ name: 'id', description: 'ID do recurso' }),
    ApiResponse({
      status: 200,
      description: 'Atualizado com sucesso',
      type: responseType,
    }),
    ApiResponse({
      status: 400,
      description: 'Dados inválidos',
      type: ApiErrorResponseDto,
    }),
    ApiResponse({
      status: 404,
      description: 'Não encontrado',
      type: ApiErrorResponseDto,
    }),
    ApiResponse({
      status: 401,
      description: 'Não autorizado',
      type: ApiErrorResponseDto,
    }),
  );
}

/**
 * Decorator para endpoint de exclusão
 */
export function ApiDelete(summary: string) {
  return applyDecorators(
    ApiOperation({ summary }),
    ApiBearerAuth(),
    ApiParam({ name: 'id', description: 'ID do recurso' }),
    ApiResponse({
      status: 200,
      description: 'Excluído com sucesso',
    }),
    ApiResponse({
      status: 404,
      description: 'Não encontrado',
      type: ApiErrorResponseDto,
    }),
    ApiResponse({
      status: 401,
      description: 'Não autorizado',
      type: ApiErrorResponseDto,
    }),
  );
}

// ---------------------------------------------------------------------------
// Decorators de Paginação
// ---------------------------------------------------------------------------

/**
 * Decorator para queries de paginação
 */
export function ApiPagination() {
  return applyDecorators(
    ApiQuery({
      name: 'page',
      required: false,
      type: Number,
      description: 'Número da página (default: 1)',
    }),
    ApiQuery({
      name: 'limit',
      required: false,
      type: Number,
      description: 'Itens por página (default: 20, max: 100)',
    }),
    ApiQuery({
      name: 'sortBy',
      required: false,
      type: String,
      description: 'Campo para ordenação',
    }),
    ApiQuery({
      name: 'sortOrder',
      required: false,
      enum: ['asc', 'desc'],
      description: 'Direção da ordenação',
    }),
  );
}

/**
 * Decorator para queries de filtro por data
 */
export function ApiDateFilter() {
  return applyDecorators(
    ApiQuery({
      name: 'startDate',
      required: false,
      type: String,
      description: 'Data inicial (ISO 8601)',
    }),
    ApiQuery({
      name: 'endDate',
      required: false,
      type: String,
      description: 'Data final (ISO 8601)',
    }),
  );
}

/**
 * Decorator para query de busca
 */
export function ApiSearch() {
  return applyDecorators(
    ApiQuery({
      name: 'search',
      required: false,
      type: String,
      description: 'Termo de busca',
    }),
  );
}

// ---------------------------------------------------------------------------
// Decorator Combinado
// ---------------------------------------------------------------------------

/**
 * Decorator completo para Controller de CRUD
 */
export function ApiCrudController(name: string) {
  return applyDecorators(ApiTags(name), ApiBearerAuth());
}
