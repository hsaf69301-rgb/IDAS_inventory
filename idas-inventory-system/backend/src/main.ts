import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { setupApp } from './app.setup';

function requireEnv() {
  const missing = ['DATABASE_URL', 'JWT_SECRET'].filter((k) => !process.env[k]);
  if (missing.length) throw new Error(`Missing required environment variables: ${missing.join(', ')}. Copy .env.example to .env`);
  if ((process.env.JWT_SECRET ?? '').length < 32) throw new Error('JWT_SECRET must be at least 32 characters');
}

async function bootstrap() {
  requireEnv();
  const app = await NestFactory.create(AppModule);
  app.set('trust proxy', 1);
  setupApp(app, { swagger: process.env.SWAGGER_ENABLED !== 'false' });
  const port = parseInt(process.env.PORT ?? '3000', 10);
  await app.listen(port, '0.0.0.0');
  new Logger('Bootstrap').log(`API ready on :${port}  (docs: /api/docs)`);
}
bootstrap();
