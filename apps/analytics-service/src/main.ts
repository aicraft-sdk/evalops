import { initTelemetry } from '@evalops/shared-common';
initTelemetry('analytics-service');

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app/app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const globalPrefix = 'api';
  app.setGlobalPrefix(globalPrefix);

  const config = new DocumentBuilder()
    .setTitle('EvalOps Analytics Service')
    .setDescription('Dashboard metrics, cost analytics, and audit trail')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup(`${globalPrefix}/docs`, app, document);

  const port = process.env.PORT || 3005;
  await app.listen(port);
  Logger.log(
    `Analytics Service running on: http://localhost:${port}/${globalPrefix}`
  );
  Logger.log(
    `Swagger docs: http://localhost:${port}/${globalPrefix}/docs`
  );
}

bootstrap();
