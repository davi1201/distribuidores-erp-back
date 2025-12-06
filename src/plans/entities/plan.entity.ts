import { ApiProperty } from '@nestjs/swagger';
import { Plan } from '@prisma/client';
// O Prisma usa um tipo interno para Decimal, então usamos 'any' ou 'number' na API
// mas para satisfazer a interface 'Plan', definimos como 'any' para evitar conflito de tipos.

export class PlanEntity implements Plan {
  @ApiProperty({ example: 'uuid-123-456' })
  id: string;

  @ApiProperty({ example: 'Plano Pro' })
  name: string;

  @ApiProperty({ example: 'plano-pro' })
  slug: string;

  @ApiProperty({ example: 99.9, description: 'Preço Mensal' })
  price: any;

  // --- CAMPO NOVO ADICIONADO AQUI ---
  @ApiProperty({
    example: 999.9,
    description: 'Preço Anual (Opcional)',
    required: false,
    nullable: true,
  })
  yearlyPrice: any;
  @ApiProperty()
  isActive: boolean;

  @ApiProperty({ required: false })
  features: any;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  @ApiProperty({
    example: 100,
    description: 'Número máximo de usuários permitidos no plano',
  })
  maxUsers: number;
}
