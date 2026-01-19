import { PrismaClient } from '@prisma/client';
import axios from 'axios';

export default async function seed(prisma: PrismaClient) {
  console.log('🗺️ Iniciando seed de Localidades (IBGE)...');

  // Verifica se já tem dados para não rodar a toa (a API do IBGE pode demorar)
  const count = await prisma.state.count();
  if (count > 0) {
    console.log(
      '   ℹ️ Localidades já parecem estar populadas. Pulando para economizar tempo.',
    );
    return;
  }

  try {
    // 1. Buscar Estados do IBGE
    const responseEstados = await axios.get(
      'https://servicodados.ibge.gov.br/api/v1/localidades/estados',
    );
    const estados = responseEstados.data;

    console.log(`   Processando ${estados.length} estados... aguarde.`);

    for (const estado of estados) {
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
    console.log('   ✅ Localidades importadas com sucesso!');
  } catch (error) {
    console.error('   ❌ Erro ao importar do IBGE:', error.message);
  }
}
