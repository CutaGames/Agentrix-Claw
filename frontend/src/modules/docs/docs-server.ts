import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from '../../app.module';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';

/**
 * 独立的文档服务器
 * 运行在8080端口，提供Swagger API文档
 */
async function startDocsServer() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  // Enable CORS
  app.enableCors({
    origin: '*',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // Swagger documentation
  const config = new DocumentBuilder()
    .setTitle('Agentrix API Documentation')
    .setDescription('Agentrix V3.0 API Documentation - SDK & API Reference')
    .setVersion('3.0.0')
    .addBearerAuth()
    .addTag('wallets', '钱包管理相关接口')
    .addTag('payments', '支付相关接口')
    .addTag('auto-pay', '自动支付相关接口')
    .addTag('products', '产品市场相关接口')
    .addTag('commissions', '分润结算相关接口')
    .addTag('orders', '订单管理相关接口')
    .addTag('agent', 'Agent相关接口')
    .addTag('auto-earn', 'Auto-Earn相关接口')
    .addTag('user-agent', '用户Agent管理接口')
    .addTag('marketplace', 'Marketplace相关接口')
    .addTag('token', 'Token发行相关接口')
    .addTag('nft', 'NFT发行相关接口')
    .addTag('mock-website', '官网Mock API')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('/', app, document, {
    customSiteTitle: 'Agentrix API Documentation',
    customCss: '.swagger-ui .topbar { display: none }',
    customfavIcon: '/favicon.ico',
  });

  const port = process.env.DOCS_PORT || 8080;
  const host = process.env.DOCS_HOST || '0.0.0.0';
  
  await app.listen(port, host);
  console.log(`📚 Agentrix API Documentation Server is running on: http://${host}:${port}`);
  console.log(`📖 Swagger UI: http://${host}:${port}/`);
}

// 如果直接运行此文件，启动文档服务器
if (require.main === module) {
  startDocsServer().catch((error) => {
    console.error('Failed to start docs server:', error);
    process.exit(1);
  });
}

export { startDocsServer };

