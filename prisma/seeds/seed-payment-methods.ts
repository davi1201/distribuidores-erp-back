import { PrismaClient } from '@prisma/client';

export default async function seed(prisma: PrismaClient) {
  console.log('🌱 Iniciando o seed de Métodos de Pagamento do Sistema...');

  const paymentMethods = [
    {
      name: 'Pix',
      code: 'PIX',
      isAcquirer: false,
    },
    {
      name: 'Dinheiro',
      code: 'CASH',
      isAcquirer: false,
    },
    {
      name: 'Cartão de Crédito',
      code: 'CREDIT_CARD',
      // True porque ele habilita a tela para o Lojista cadastrar as taxas e parcelas (1x a 12x)
      isAcquirer: true,
    },
    {
      name: 'Cartão de Débito',
      code: 'DEBIT_CARD',
      isAcquirer: true, // Também tem taxa de maquininha (geralmente em 1x)
    },
    {
      name: 'Cheque',
      code: 'CHECK',
      isAcquirer: false,
    },
    {
      name: 'Boleto Bancário',
      code: 'BOLETO',
      isAcquirer: false,
    },
    {
      name: 'Crediário / Carteira',
      code: 'STORE_CREDIT',
      isAcquirer: false, // Usado para as vendas "fiado" ou com as condições customizadas 30/60/90
    },
  ];

  for (const method of paymentMethods) {
    // O upsert é perfeito aqui: ele tenta buscar pelo código.
    // Se existir, não faz nada (update vazio). Se não existir, ele cria.
    await prisma.systemPaymentMethod.upsert({
      where: { code: method.code },
      update: {
        name: method.name,
        isAcquirer: method.isAcquirer,
      },
      create: {
        name: method.name,
        code: method.code,
        isAcquirer: method.isAcquirer,
      },
    });
  }

  console.log('✅ Seed de métodos de pagamento finalizado com sucesso!');
}
