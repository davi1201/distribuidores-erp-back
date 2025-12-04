import { PrismaClient } from '@prisma/client';
import axios from 'axios';

const prisma = new PrismaClient();

async function main() {
  console.log('Iniciando seed de localidades...');

  // 1. Buscar Estados do IBGE
  const responseEstados = await axios.get(
    'https://servicodados.ibge.gov.br/api/v1/localidades/estados',
  );
  const estados = responseEstados.data;

  for (const estado of estados) {
    console.log(`Criando estado: ${estado.nome}`);

    const stateCreated = await prisma.state.upsert({
      where: { uf: estado.sigla },
      update: {},
      create: {
        name: estado.nome,
        uf: estado.sigla,
      },
    });

    // 2. Buscar Cidades deste Estado
    const responseCidades = await axios.get(
      `https://servicodados.ibge.gov.br/api/v1/localidades/estados/${estado.id}/municipios`,
    );
    const cidades = responseCidades.data;

    const citiesData = cidades.map((cidade: any) => ({
      name: cidade.nome,
      stateId: stateCreated.id,
      ibgeCode: String(cidade.id),
    }));

    await prisma.city.createMany({
      data: citiesData,
      skipDuplicates: true,
    });
  }

  console.log('Seed finalizado!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
