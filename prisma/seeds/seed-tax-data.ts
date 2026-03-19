import { PrismaClient, CfopType } from '@prisma/client';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';

export async function seed(prisma: PrismaClient) {
  console.log('📊 Iniciando Seed de Dados Fiscais (NCM, CEST, CFOP)...');

  // 1. SEED CFOP (Os mais comuns e busca externa)
  await seedCfops(prisma);

  // 2. SEED NCM (Utilizando arquivo local ncm.json)
  await seedNcms(prisma);

  // 3. SEED CEST (Busca externa devido ao volume)
  await seedCests(prisma);

  console.log('✅ Seed de dados fiscais concluído!');
}

async function seedCfops(prisma: PrismaClient) {
  console.log('  -> Populando CFOPs...');
  
  // Lista robusta de CFOPs comuns para garantir funcionamento offline
  const commonCfops = [
    { code: '5101', description: 'Venda de produção do estabelecimento', type: CfopType.EXIT },
    { code: '5102', description: 'Venda de mercadoria adquirida ou recebida de terceiros', type: CfopType.EXIT },
    { code: '5403', description: 'Venda de produção (ST)', type: CfopType.EXIT },
    { code: '5405', description: 'Venda de mercadoria recebida de terceiros (ST)', type: CfopType.EXIT },
    { code: '6101', description: 'Venda de produção (Interestadual)', type: CfopType.EXIT },
    { code: '6102', description: 'Venda de mercadoria recebida de terceiros (Interestadual)', type: CfopType.EXIT },
    { code: '1102', description: 'Compra para comercialização', type: CfopType.ENTRY },
    { code: '2102', description: 'Compra para comercialização (Interestadual)', type: CfopType.ENTRY },
    { code: '1202', description: 'Devolução de venda de mercadoria', type: CfopType.ENTRY },
    { code: '5910', description: 'Remessa em bonificação, doação ou brinde', type: CfopType.EXIT },
    { code: '5949', description: 'Outra saída de mercadoria ou prestação de serviço não especificado', type: CfopType.EXIT },
  ];

  for (const cfop of commonCfops) {
    await prisma.cfop.upsert({
      where: { code: cfop.code },
      update: { description: cfop.description, type: cfop.type },
      create: cfop,
    });
  }

  // Utilizando arquivo local cfop.json
  try {
    const cfopPath = path.join(__dirname, 'cfop.json');
    if (fs.existsSync(cfopPath)) {
      const cfopFileContent = fs.readFileSync(cfopPath, 'utf8');
      const cfopData = JSON.parse(cfopFileContent);
      const rawData = cfopData.list;

      if (Array.isArray(rawData)) {
        console.log(`     - Encontrados ${rawData.length} CFOPs no arquivo local. Atualizando...`);
        for (const item of rawData) {
          const code = String(item.codigo).replace(/\D/g, '');
          if (code.length !== 4) continue;
          const type = ['1', '2', '3'].includes(code[0]) ? CfopType.ENTRY : CfopType.EXIT;
          await prisma.cfop.upsert({
            where: { code },
            update: { description: item.descricao, type },
            create: { code, description: item.descricao, type },
          });
        }
      }
    } else {
      console.log('     ⚠️  Arquivo cfop.json não encontrado para carga completa.');
    }
  } catch (error) {
    console.error('     ❌ Erro ao processar arquivo local de CFOPs:', error.message);
  }
}

async function seedNcms(prisma: PrismaClient) {
  console.log('  -> Populando NCMs (Aguarde, isso pode demorar)...');
  
  // Lista mínima de NCMs genéricos para não ficar vazio em caso de falha de rede
  const fallbackNcms = [
    { code: '00000000', description: 'NCM Genérico / Serviço' },
    { code: '21069090', description: 'Outras preparações alimentícias' },
  ];

  for (const ncm of fallbackNcms) {
    await prisma.ncm.upsert({
      where: { code: ncm.code },
      update: {},
      create: ncm,
    });
  }

  try {
    const ncmPath = path.join(__dirname, 'ncm.json');
    if (!fs.existsSync(ncmPath)) {
      console.error(`     ❌ Arquivo NCM não encontrado em: ${ncmPath}`);
      return;
    }

    const ncmFileContent = fs.readFileSync(ncmPath, 'utf8');
    const ncmData = JSON.parse(ncmFileContent);
    const rawData = ncmData.Nomenclaturas;

    if (Array.isArray(rawData)) {
      const data = rawData.map(item => ({
        code: String(item.Codigo).replace(/\D/g, ''),
        description: item.Descricao,
      })).filter(item => item.code.length === 8);

      console.log(`     - Processando ${data.length} NCMs do arquivo local...`);

      const chunkSize = 500;
      for (let i = 0; i < data.length; i += chunkSize) {
        const chunk = data.slice(i, i + chunkSize);
        await Promise.all(chunk.map(item => 
          prisma.ncm.upsert({
            where: { code: item.code },
            update: { description: item.description },
            create: item
          })
        ));
      }
    }
  } catch (error) {
    console.error('     ❌ Erro ao processar arquivo local de NCMs:', error.message);
  }
}

async function seedCests(prisma: PrismaClient) {
  console.log('  -> Populando CESTs...');
  try {
    const cestPath = path.join(__dirname, 'cest.json');
    if (!fs.existsSync(cestPath)) {
      console.log('     ⚠️  Arquivo cest.json não encontrado para carga local.');
      return;
    }

    const cestFileContent = fs.readFileSync(cestPath, 'utf8');
    const rawData = JSON.parse(cestFileContent);

    if (Array.isArray(rawData)) {
      console.log(`     - Processando ${rawData.length} itens do arquivo local cest.json...`);
      const chunkSize = 500;
      for (let i = 0; i < rawData.length; i += chunkSize) {
        const chunk = rawData.slice(i, i + chunkSize);
        await Promise.all(chunk.map(item => {
          const code = String(item.cod || item.codigo || item.code).replace(/\D/g, '');
          if (!code) return Promise.resolve();
          
          const description = item.msg || item.descricao || item.description;
          
          return prisma.cest.upsert({
            where: { code },
            update: { description },
            create: { code, description }
          });
        }));
      }
    }
  } catch (error) {
    console.error('     ❌ Erro ao processar arquivo local de CESTs:', error.message);
  }
}
