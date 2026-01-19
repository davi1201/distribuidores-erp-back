import { PrismaClient } from '@prisma/client';

export default async function seed(prisma: PrismaClient) {
  console.log(
    '💳 Iniciando seed de Métodos de Pagamento para TODOS os tenants...',
  );

  // 1. Busca TODOS os tenants cadastrados
  const tenants = await prisma.tenant.findMany();

  if (tenants.length === 0) {
    console.warn(
      '   ⚠️ Nenhum tenant encontrado no banco de dados. Pulei esta etapa.',
    );
    return;
  }

  const methods = [
    { name: 'Dinheiro', code: 'CASH' },
    { name: 'Pix', code: 'PIX' },
    { name: 'Boleto Bancário', code: 'BOLETO' },
    { name: 'Cartão de Crédito', code: 'CREDIT_CARD' },
    { name: 'Cartão de Débito', code: 'DEBIT_CARD' },
    { name: 'Transferência Bancária', code: 'BANK_TRANSFER' },
    { name: 'Cheque', code: 'CHECK' },
    { name: 'Outro', code: 'OTHER' },
  ];

  console.log(`   Encontrados ${tenants.length} tenants. Processando...`);

  // 2. Itera sobre cada tenant
  for (const tenant of tenants) {
    // console.log(`   -> Atualizando: ${tenant.name}`); // Descomente se quiser logs detalhados

    // Estratégia Segura: Verifica um a um para evitar duplicatas
    for (const method of methods) {
      // Verificamos se já existe pelo CODE ou pelo NOME
      const exists = await prisma.paymentMethod.findFirst({
        where: {
          tenantId: tenant.id,
          OR: [{ code: method.code }, { name: method.name }],
        },
      });

      if (!exists) {
        await prisma.paymentMethod.create({
          data: {
            tenantId: tenant.id,
            name: method.name,
            code: method.code,
            isActive: true,
          },
        });
      }
    }
  }

  console.log(
    '   ✅ Métodos de Pagamento verificados/criados para todos os tenants!',
  );
}
