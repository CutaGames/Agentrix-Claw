import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
  });

  // 静态文件服务
  app.useStaticAssets(join(process.cwd(), 'uploads'), {
    prefix: '/api/uploads/',
  });

  // Enable CORS
  const corsOrigin = process.env.CORS_ORIGIN || 'http://localhost:3000';
  app.enableCors({
    origin: corsOrigin.split(',').map(origin => origin.trim()),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Global exception filter
  const { HttpExceptionFilter } = await import('./common/filters/http-exception.filter');
  app.useGlobalFilters(new HttpExceptionFilter());

  // Global logging interceptor
  const { LoggingInterceptor } = await import('./common/interceptors/logging.interceptor');
  app.useGlobalInterceptors(new LoggingInterceptor());

  // API prefix
  app.setGlobalPrefix('api');

  // Swagger documentation for Admin API
  const config = new DocumentBuilder()
    .setTitle('Agentrix Admin API')
    .setDescription('Agentrix 后台管理 API 文档')
    .setVersion('1.0.0')
    .addBearerAuth()
    .addTag('admin', '后台管理相关接口')
    .addServer('http://localhost:3002', '本地开发环境')
    .addServer('https://admin-api.agentrix.io', '生产环境')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
    },
    customSiteTitle: 'Agentrix Admin API',
  });

  // 后台API运行在3002端口
  const port = process.env.ADMIN_PORT || 3002;
  const host = process.env.HOST || '0.0.0.0';
  await app.listen(port, host);
  console.log(`🚀 Agentrix Admin API is running on: http://${host}:${port}`);
  console.log(`📚 Admin API Documentation: http://${host}:${port}/api/docs`);
}

bootstrap();

