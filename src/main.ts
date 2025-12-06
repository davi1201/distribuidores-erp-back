import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import cookieParser from 'cookie-parser'; // Importação mais segura para TS

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
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

      // Verifica se a origem está na lista OU se é um subdomínio de preview da Vercel
      // Isso libera automaticamente deploys de teste como: https://front-git-develop.vercel.app
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

  await app.listen(5555);
}
bootstrap();
