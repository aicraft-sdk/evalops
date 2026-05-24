import { initTelemetry } from '@evalops/shared-common';
initTelemetry('auth-service');

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app/app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const globalPrefix = 'api';
  app.setGlobalPrefix(globalPrefix);

  const config = new DocumentBuilder()
    .setTitle('EvalOps Auth Service')
    .setDescription('Authentication, users, organizations, and permissions')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup(`${globalPrefix}/docs`, app, document);

  const port = process.env.PORT || 3001;
  await app.listen(port);
  Logger.log(
    `Auth Service running on: http://localhost:${port}/${globalPrefix}`
  );
  Logger.log(
    `Swagger docs: http://localhost:${port}/${globalPrefix}/docs`
  );
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises -- top-level bootstrap call; process exits on uncaught rejection
bootstrap();
