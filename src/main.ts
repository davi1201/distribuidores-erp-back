import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import cookieParser from 'cookie-parser';
import { ExpressAdapter } from '@nestjs/platform-express';
import express from 'express';

const server = express();

export async function createApp() {
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
  return server;
}

export default createApp();
