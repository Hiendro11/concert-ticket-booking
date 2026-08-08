import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import {
  DocumentBuilder,
  SwaggerModule,
} from '@nestjs/swagger';

import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/errors/global-exception.filter';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  const configService = app.get(ConfigService);

  app.setGlobalPrefix('api/v1', {
    exclude: ['health'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  app.useGlobalFilters(
    new GlobalExceptionFilter(),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Concert Ticket Booking API')
    .setDescription(
      'Backend API for concert ticket booking and operation workflows.',
    )
    .setVersion('1.0')
    .addApiKey(
      {
        type: 'apiKey',
        name: 'X-User-Id',
        in: 'header',
        description:
          'Assessment-only simulated user identity.',
      },
      'user-id',
    )
    .addApiKey(
      {
        type: 'apiKey',
        name: 'Idempotency-Key',
        in: 'header',
        description:
          'Required when creating a booking.',
      },
      'idempotency-key',
    )
    .build();

  const document =
    SwaggerModule.createDocument(
      app,
      swaggerConfig,
    );

  SwaggerModule.setup(
    'docs',
    app,
    document,
    {
      swaggerOptions: {
        persistAuthorization: true,
      },
    },
  );

  const port =
    configService.get<number>('PORT', 3000);

  await app.listen(port);

  console.log(
    `Application: http://localhost:${port}`,
  );

  console.log(
    `Swagger:     http://localhost:${port}/docs`,
  );
}

bootstrap();