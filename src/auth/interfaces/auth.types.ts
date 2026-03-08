export enum UserRole {
  SUPER_ADMIN = 'SUPER_ADMIN',
  OWNER = 'OWNER',
  ADMIN = 'ADMIN',
  SELLER = 'SELLER',
  SUPPORT = 'SUPPORT',
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  tenantId?: string;
}
