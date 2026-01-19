import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

export default async function seed(prisma: PrismaClient) {
  console.log('👤 Iniciando seed de Usuários e Tenant...');

  const adminEmail = 'admin@seusistema.com';

  // 1. Cria ou recupera o Super Admin
  const hashedPassword = await bcrypt.hash('Mudar@123', 10);

  const superAdmin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      name: 'Super Admin Global',
      email: adminEmail,
      password: hashedPassword,
      role: Role.SUPER_ADMIN,
      tenantId: null, // Admin global
    },
  });

  console.log('   ✅ Super Admin garantido.');
}
