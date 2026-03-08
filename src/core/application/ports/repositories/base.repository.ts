// ============================================================================
// INTERFACE BASE PARA TODOS OS REPOSITÓRIOS
// ============================================================================

export interface PaginationParams {
  page?: number;
  limit?: number;
}

export interface PaginationResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export interface FindOptions<TFilter = Record<string, unknown>> {
  where?: TFilter;
  pagination?: PaginationParams;
  orderBy?: Record<string, 'asc' | 'desc'>;
  include?: Record<string, boolean | object>;
}

export abstract class BaseRepository<
  TEntity,
  TCreateInput,
  TUpdateInput,
  TFilter = Record<string, unknown>,
> {
  abstract findById(id: string): Promise<TEntity | null>;
  abstract findOne(filter: TFilter): Promise<TEntity | null>;
  abstract findMany(options?: FindOptions<TFilter>): Promise<TEntity[]>;
  abstract findManyPaginated(
    options: FindOptions<TFilter>,
  ): Promise<PaginationResult<TEntity>>;
  abstract create(data: TCreateInput): Promise<TEntity>;
  abstract createMany(data: TCreateInput[]): Promise<TEntity[]>;
  abstract update(id: string, data: TUpdateInput): Promise<TEntity>;
  abstract delete(id: string): Promise<void>;
  abstract softDelete?(id: string): Promise<void>;
  abstract count(filter?: TFilter): Promise<number>;
  abstract exists(filter: TFilter): Promise<boolean>;
}
