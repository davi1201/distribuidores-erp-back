import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const adminEmail = 'admin@seusistema.com';

  const userExists = await prisma.user.findUnique({
    where: { email: adminEmail },
  });

  if (!userExists) {
    const hashedPassword = await bcrypt.hash('Mudar@123', 10);

    await prisma.user.create({
      data: {
        name: 'Super Admin Global',
        email: adminEmail,
        password: hashedPassword,
        role: Role.SUPER_ADMIN,
        tenantId: null,
      },
    });
    console.log('Super Admin criado com sucesso (Sem vínculo de tenant).');
  }
}

main()
  .catch((e) => console.error(e))
  .finally(async () => await prisma.$disconnect());
