import { BaseRepository } from './base.repository';

// ============================================================================
// ENTIDADES
// ============================================================================
export interface CustomerEntity {
  id: string;
  tenantId: string;
  name: string;
  tradeName: string | null;
  document: string;
  documentType: 'CPF' | 'CNPJ';
  email: string | null;
  phone: string | null;
  cellphone: string | null;
  stateRegistration: string | null;
  municipalRegistration: string | null;
  // Address
  zipCode: string | null;
  street: string | null;
  number: string | null;
  complement: string | null;
  neighborhood: string | null;
  cityId: number | null;
  stateId: number | null;
  // Business
  priceListId: string | null;
  categoryId: string | null;
  paymentTermId: string | null;
  creditLimit: number;
  currentDebt: number;
  notes: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  // Relations
  priceList?: { id: string; name: string } | null;
  category?: { id: string; description: string } | null;
  city?: { id: number; name: string } | null;
  state?: { id: number; name: string; uf: string } | null;
}

// ============================================================================
// INPUTS
// ============================================================================
export interface CreateCustomerInput {
  tenantId: string;
  name: string;
  tradeName?: string;
  document: string;
  documentType: 'CPF' | 'CNPJ';
  email?: string;
  phone?: string;
  cellphone?: string;
  stateRegistration?: string;
  zipCode?: string;
  street?: string;
  number?: string;
  complement?: string;
  neighborhood?: string;
  cityId?: number;
  stateId?: number;
  priceListId?: string;
  categoryId?: string;
  paymentTermId?: string;
  creditLimit?: number;
  notes?: string;
}

export interface UpdateCustomerInput {
  name?: string;
  tradeName?: string;
  email?: string;
  phone?: string;
  cellphone?: string;
  zipCode?: string;
  street?: string;
  number?: string;
  complement?: string;
  neighborhood?: string;
  cityId?: number;
  stateId?: number;
  priceListId?: string;
  categoryId?: string;
  paymentTermId?: string;
  creditLimit?: number;
  notes?: string;
  isActive?: boolean;
}

// ============================================================================
// FILTROS
// ============================================================================
export interface CustomerFilter {
  tenantId: string;
  categoryId?: string;
  priceListId?: string;
  isActive?: boolean;
  search?: string;
  document?: string;
  cityId?: number;
  stateId?: number;
}

// ============================================================================
// INTERFACE DO REPOSITÓRIO
// ============================================================================
export abstract class CustomerRepository extends BaseRepository<
  CustomerEntity,
  CreateCustomerInput,
  UpdateCustomerInput,
  CustomerFilter
> {
  abstract findByDocument(
    tenantId: string,
    document: string,
  ): Promise<CustomerEntity | null>;
  abstract findByEmail(
    tenantId: string,
    email: string,
  ): Promise<CustomerEntity | null>;
  abstract updateDebt(customerId: string, amount: number): Promise<void>;
  abstract incrementDebt(customerId: string, amount: number): Promise<void>;
  abstract decrementDebt(customerId: string, amount: number): Promise<void>;
}
