import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import cookieParser from 'cookie-parser';
import { ExpressAdapter } from '@nestjs/platform-express';
import express from 'express';

const server = express();
let isAppInitialized = false; // Flag para evitar reinicialização no Vercel (Cold Starts)

export async function bootstrapApp() {
  // Se já inicializou (warm boot no Vercel), não faz o setup de novo
  if (isAppInitialized) return server;

  const app = await NestFactory.create(AppModule, new ExpressAdapter(server), {
    rawBody: true,
  });

  app.setGlobalPrefix('api/v1');
  app.use(cookieParser());

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);

      const allowedOrigins = [
        'http://localhost:3000',
        'http://localhost:3005',
        'https://distribuidores-erp-front.vercel.app',
      ];

      const isAllowed =
        allowedOrigins.includes(origin) || origin.endsWith('.vercel.app');

      if (isAllowed) callback(null, true);
      else callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
  });

  await app.init();
  isAppInitialized = true;

  return server;
}

// 🔥 SOMENTE LOCALHOST
if (!process.env.VERCEL) {
  bootstrapApp().then((srv) => {
    const port = process.env.PORT || 5555;
    // No localhost, nós mandamos o Express "escutar" a porta ativamente
    srv.listen(port, () => {
      console.log(`🚀 API rodando em http://localhost:${port}`);
    });
  });
}

// 👇 EXPORT USADO PELO VERCEL (Serverless Function)
export default async (req: any, res: any) => {
  // 1. Garante que o NestJS montou as rotas no Express
  await bootstrapApp();
  // 2. Repassa a requisição HTTP nativa do Vercel para o Express resolver
  server(req, res);
};
