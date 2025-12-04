import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export enum BillingCycle {
  MONTHLY = 'monthly',
  YEARLY = 'yearly',
}

export class RegisterWithSubscriptionDto {
  // --- DADOS DA EMPRESA ---
  @IsString() @IsNotEmpty() companyName: string;
  @IsString() @IsNotEmpty() companySlug: string;
  @IsString() @IsNotEmpty() document: string; // CNPJ/CPF

  // --- DADOS DO USUÁRIO ---
  @IsString() @IsNotEmpty() userName: string;
  @IsEmail() userEmail: string;
  @IsString() @MinLength(6) password: string;

  // --- DADOS DO PAGAMENTO ---
  @IsString() @IsNotEmpty() planSlug: string;
  @IsString() @IsNotEmpty() cardToken: string; // Token gerado pelo front

  @IsString() cardLast4: string;

  @IsEnum(BillingCycle)
  @IsOptional() // Se não mandar, assumimos mensal
  cycle?: BillingCycle;
}
