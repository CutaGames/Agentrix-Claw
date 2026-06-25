import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { AppModule } from './app.module';
import { fixEnumTypesBeforeSync } from './config/database-pre-sync';
import { fixEnumTypesAfterSync } from './config/database-post-sync';

async function bootstrap() {
  // 在 TypeORM synchronize 之前修复枚举类型
  // 这确保两个表使用相同的枚举类型名称
  try {
    await fixEnumTypesBeforeSync();
  } catch (error: any) {
    console.warn('⚠️  枚举类型修复失败（可能表不存在，将在 synchronize 时创建）:', error.message);
  }

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true, // 启用rawBody以支持Stripe Webhook
  });


  // 静态文件服务 - 用于提供头像等文件访问
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

  // Swagger documentation
  const config = new DocumentBuilder()
    .setTitle('Agentrix API')
    .setDescription('Agentrix V7.0 API Documentation - ERC-8004 Session Keys & QuickPay')
    .setVersion('7.0.0')
    .addBearerAuth()
    .addTag('wallets', '钱包管理相关接口')
    .addTag('payments', '支付相关接口')
    .addTag('payment', '支付路由与 Pre-Flight Check (V7.0)')
    .addTag('relayer', 'Relayer 服务 - QuickPay 处理 (V7.0)')
    .addTag('sessions', 'Session 管理 - ERC-8004 (V7.0)')
    .addTag('auto-pay', '自动支付相关接口')
    .addTag('products', '产品市场相关接口')
    .addTag('commissions', '分润结算相关接口')
    .addTag('orders', '订单管理相关接口')
    .addServer('http://localhost:3001', '本地开发环境（API文档）')
    .addServer('https://api.agentrix.io', '生产环境')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
    },
    customSiteTitle: 'Agentrix API V7.0',
  });

  // 主API运行在3001端口（用于API文档）
  const port = process.env.PORT || 3001;
  const host = process.env.HOST || '0.0.0.0';
  await app.listen(port, host);
  console.log(`🚀 Agentrix Backend is running on: http://${host}:${port}`);
  console.log(`📚 API Documentation: http://${host}:${port}/api/docs`);
}

bootstrap();
