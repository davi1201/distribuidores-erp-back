import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import cookieParser from 'cookie-parser';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api/v1');
  app.use(cookieParser());

  const allowedOrigins = [
    'http://localhost:3005',
    'https://distribuidores-erp-back.vercel.app',
  ];

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error('Origin not allowed by CORS'), false);
    },
    credentials: true,
  });

  // app.enableCors({
  //   origin: 'http://localhost:3005',
  //   credentials: true,
  // });
  await app.listen(5555);
}
bootstrap();
