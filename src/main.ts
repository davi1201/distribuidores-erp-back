import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import cookieParser from 'cookie-parser'; // Importação mais segura para TS
import { RedisIoAdapter } from './adpters/redis.io.adapter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    rawBody: true,
  });
  app.setGlobalPrefix('api/v1');
  app.use(cookieParser());

  app.enableCors({
    origin: (origin, callback) => {
      // Permite requisições sem origem (ex: Postman, Mobile Apps ou Server-to-Server)
      if (!origin) {
        return callback(null, true);
      }

      const allowedOrigins = [
        'http://localhost:3000',
        'http://localhost:3005',
        'https://distribuidores-erp-front.vercel.app',
      ];
      const isAllowed =
        allowedOrigins.includes(origin) || origin.endsWith('.vercel.app');

      if (isAllowed) {
        callback(null, true);
      } else {
        console.warn(
          `🚫 Bloqueio CORS: A origem ${origin} tentou acessar a API.`,
        );
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: 'Content-Type, Accept, Authorization, X-Requested-With', // Adicionei headers comuns
  });

  // CONFIGURAÇÃO DO REDIS ADAPTER
  const redisIoAdapter = new RedisIoAdapter(app);
  await redisIoAdapter.connectToRedis(); // Conecta no Redis antes de subir o app
  app.useWebSocketAdapter(redisIoAdapter); // Aplica o adaptador

  const port = process.env.PORT || 5555;
  await app.listen(port);
}
bootstrap();
