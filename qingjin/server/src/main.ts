import 'dotenv/config';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import express from 'express';
import { AppModule } from './app.module';
import { requestContextMiddleware } from './common/request-context';
import { PrismaExceptionFilter } from './common/prisma-exception.filter';
import { JwtService } from '@nestjs/jwt';
import { PublishService } from './publish/publish.service';
import { startLiveSiteServer, startPreviewServer } from './publish/static-servers';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Behind nginx/Cloudflare: use X-Forwarded-For so rate limiting and audit logs see the real client IP.
  app.set('trust proxy', Number(process.env.TRUST_PROXY ?? 1));
  app.disable('x-powered-by');
  app.use(requestContextMiddleware);
  // Analytics beacons arrive as text/plain (no CORS preflight); parse them before Nest's JSON parser.
  app.use('/api/track', express.text({ type: () => true, limit: '4kb' }));
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.useGlobalFilters(new PrismaExceptionFilter());

  const origins = (process.env.CORS_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (origins.length) app.enableCors({ origin: origins });

  if (process.env.NODE_ENV !== 'production') {
    const doc = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('QING JIN Admin API').addBearerAuth().build(),
    );
    SwaggerModule.setup('api/docs', app, doc);
  }

  app.enableShutdownHooks();
  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);

  const publish = app.get(PublishService);
  await publish.recoverInterrupted();
  const paths = publish.paths;
  startPreviewServer(Number(process.env.PREVIEW_PORT ?? 4400), paths, app.get(JwtService));
  if (process.env.SERVE_SITE_PORT) startLiveSiteServer(Number(process.env.SERVE_SITE_PORT), paths);
  Logger.log(`API listening on http://localhost:${port}/api`, 'Bootstrap');
}
void bootstrap();
