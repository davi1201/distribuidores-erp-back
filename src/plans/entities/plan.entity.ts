import { ApiProperty } from '@nestjs/swagger';
import { Plan } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

export class PlanEntity implements Plan {
  @ApiProperty({ example: 'uuid-123-456', description: 'ID único do plano' })
  id: string;

  @ApiProperty({
    example: 'prod_ABC123XYZ',
    description: 'ID do produto no Stripe',
    required: false,
    nullable: true,
  })
  stripeProductId: string | null;

  @ApiProperty({ example: 'Plano Pro', description: 'Nome comercial' })
  name: string;

  @ApiProperty({ example: 'plano-pro', description: 'Slug para URL' })
  slug: string;

  @ApiProperty({
    example: 'Descrição do plano',
    required: false,
    nullable: true,
  })
  description: string | null;

  @ApiProperty({ example: 99.9 })
  price: Decimal;

  @ApiProperty({ example: 999.9, required: false, nullable: true })
  yearlyPrice: Decimal | null;

  @ApiProperty({
    description: 'ID do preço mensal no Stripe',
    required: false,
    nullable: true,
  })
  stripeMonthlyPriceId: string | null;

  @ApiProperty({
    description: 'ID do preço anual no Stripe',
    required: false,
    nullable: true,
  })
  stripeYearlyPriceId: string | null;

  // 👇 NOVOS CAMPOS DO ASAAS
  @ApiProperty({
    description: 'ID do plano mensal no Asaas',
    required: false,
    nullable: true,
  })
  asaasMonthlyPlanId: string | null;

  @ApiProperty({
    description: 'ID do plano anual no Asaas',
    required: false,
    nullable: true,
  })
  asaasYearlyPlanId: string | null;

  @ApiProperty()
  isActive: boolean;

  @ApiProperty({ required: false })
  features: any; // JSON

  @ApiProperty({
    example: 5,
    description: 'Limite de usuários permitidos no plano',
  })
  maxUsers: number;

  @ApiProperty({
    example: 100,
    description: 'Limite de boletos permitidos no plano',
  })
  maxBoletos: number;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}
