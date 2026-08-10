import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'node:path';
import { AppModule } from './app.module';
import { config } from './config';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
    rawBody: true, // needed to verify OpenWA webhook HMAC signatures
  });
  app.useBodyParser('json', { limit: '2mb' }); // knowledge docs can be large
  app.enableCors(); // widget is embedded on customer sites
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useStaticAssets(join(__dirname, '..', 'public'));

  await app.listen(config.port);
  console.log(`\nAPI running:`);
  console.log(`  Widget demo  http://localhost:${config.port}`);
  console.log(`  REST API     http://localhost:${config.port}/v1/...`);
  console.log(`  AI engine    ${config.aiEngineUrl}\n`);
}

bootstrap();
