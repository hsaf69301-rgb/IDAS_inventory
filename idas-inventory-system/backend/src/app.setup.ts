import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import * as cookieParser from 'cookie-parser';

/** Shared by main.ts and the e2e tests so tests exercise the real pipeline. */
export function setupApp(app: INestApplication, opts: { swagger?: boolean } = {}) {
  app.setGlobalPrefix('api');
  app.use(helmet());
  app.use(cookieParser());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, transformOptions: { enableImplicitConversion: false } }));
  const origins = (process.env.CORS_ORIGINS ?? process.env.FRONTEND_URL ?? 'http://localhost:5173').split(',').map((s) => s.trim());
  app.enableCors({ origin: origins, credentials: true });
  if (opts.swagger) {
    const cfg = new DocumentBuilder().setTitle('IDAS Inventory & Resource Management API').setDescription('REST API for IDAS Lab, Dept. of IT, University of Peradeniya').setVersion('1.0').addBearerAuth().build();
    SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, cfg));
  }
}
