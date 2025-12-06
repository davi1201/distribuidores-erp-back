import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import cookieParser from 'cookie-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api/v1');
  app.use(cookieParser());

  const allowedOrigins = [
    'http://localhost:3005',
    'https://distribuidores-erp-front.vercel.app',
  ];

  app.enableCors({
    origin: allowedOrigins,
    credentials: true, // Obrigatório pois usamos Cookies
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
  });
  await app.listen(5555);
}
bootstrap();
