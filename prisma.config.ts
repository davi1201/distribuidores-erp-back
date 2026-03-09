import path from 'node:path';
import { defineConfig } from 'prisma/config';
import { config } from 'dotenv';

// Load .env file
config();

export default defineConfig({
  schema: path.join(__dirname, 'prisma', 'schema'),
  datasource: {
    url: process.env.DATABASE_URL!,
  },
  migrations: {
    seed: 'ts-node prisma/seed.ts',
  },
});
