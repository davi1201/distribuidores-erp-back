import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

async function main() {
  const seedsDir = path.join(__dirname, 'seeds'); // Caminho para a pasta seeds

  // 1. Lê os arquivos da pasta
  const files = fs
    .readdirSync(seedsDir)
    .filter((file) => file.endsWith('.ts') || file.endsWith('.js')) // Filtra apenas TS/JS
    .sort(); // Ordena alfabeticamente (01_..., 02_...)

  console.log(`🌱 Encontrados ${files.length} arquivos de seed...`);

  // 2. Executa um por um
  for (const file of files) {
    const filePath = path.join(seedsDir, file);
    console.log(`➡️  Executando: ${file}`);

    // Importa dinamicamente o módulo
    // Nota: O require ou import dinâmico depende da config do seu tsconfig (CommonJS vs ESM)
    // Se estiver usando CommonJS (padrão no NestJS/Node):
    const seedModule = require(filePath);

    // Se estiver usando ESM (import), use: await import(filePath);

    // Espera que o arquivo tenha um 'export default' ou 'export const seed'
    const runSeed = seedModule.default || seedModule.seed;

    if (!runSeed) {
      console.warn(
        `⚠️  Arquivo ${file} não exporta uma função default ou 'seed'. Pulando.`,
      );
      continue;
    }

    // Passa a instância do prisma para reutilizar a conexão
    await runSeed(prisma);
  }
}

main()
  .catch((e) => {
    console.error('❌ Erro fatal no seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
