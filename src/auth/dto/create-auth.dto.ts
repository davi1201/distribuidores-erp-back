import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';

export class RegisterDto {
  // Dados da Empresa (Tenant)
  @IsString()
  @IsNotEmpty()
  companyName: string;

  @IsString()
  @IsNotEmpty()
  companySlug: string; // ex: minha-distribuidora

  @IsString()
  @IsNotEmpty()
  document: string; // CNPJ

  // Dados do Plano
  @IsString()
  @IsNotEmpty()
  planSlug: string; // ex: 'basic' ou 'pro' (mais fácil pro frontend mandar o slug do que o ID)

  // Dados do Usuário Admin
  @IsString()
  @IsNotEmpty()
  userName: string;

  @IsEmail()
  userEmail: string;

  @IsString()
  @MinLength(6)
  password: string;
}
