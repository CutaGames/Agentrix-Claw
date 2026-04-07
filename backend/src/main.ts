import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ProxyAgent, setGlobalDispatcher } from 'undici';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import * as session from 'express-session';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { fixEnumTypesBeforeSync } from './config/database-pre-sync';

async function bootstrap() {
  console.log('🚀 Starting Agentrix Backend...');

  // ── Startup env validation (warn on missing optional-but-important vars) ──
  const envWarnings: string[] = [];
  if (!process.env.EXPO_ACCESS_TOKEN)     envWarnings.push('EXPO_ACCESS_TOKEN  — push notifications will not work');
  if (!process.env.TELEGRAM_BOT_TOKEN)    envWarnings.push('TELEGRAM_BOT_TOKEN — Telegram webhook disabled');
  if (!process.env.DISCORD_PUBLIC_KEY && !process.env.DISCORD_CLIENT_SECRET)
                                          envWarnings.push('DISCORD_PUBLIC_KEY — Discord webhook disabled');
  if (!(process.env.TWITTER_APIKEY_SECRET || process.env.TWITTER_CONSUMER_SECRET))
                                          envWarnings.push('TWITTER_APIKEY_SECRET — Twitter webhook disabled');
  if (!process.env.RELAYER_PRIVATE_KEY)   envWarnings.push('RELAYER_PRIVATE_KEY — QuickPay relaying disabled');
  if (envWarnings.length) {
    console.warn('⚠️  Missing optional environment variables:');
    envWarnings.forEach(w => console.warn(`   • ${w}`));
  }

  // 配置全局代理（针对 Node.js fetch/undici）
  // 注意：在某些 WSL 环境下，设置 ProxyAgent 会导致初始化挂起，因此默认关闭
  /*
  const httpsProxy = process.env.HTTPS_PROXY || process.env.https_proxy || 
                     process.env.HTTP_PROXY || process.env.http_proxy;
  
  if (httpsProxy) {
    try {
      const proxyAgent = new ProxyAgent(httpsProxy);
      setGlobalDispatcher(proxyAgent);
    } catch (proxyError: any) {
      console.error(`⚠️ Failed to set global proxy: ${proxyError.message}`);
    }
  }
  */
  
  // Security: enforce strong secrets in production
  const isProduction = process.env.NODE_ENV === 'production';
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'default-secret') {
    if (isProduction) {
      console.error('❌ JWT_SECRET is not set or using default — refusing to start in production');
      process.exit(1);
    }
    console.warn('⚠️  JWT_SECRET is not set or using default — THIS IS INSECURE IN PRODUCTION');
  }
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET === 'agentrix-secret-key-2025') {
    if (isProduction) {
      console.error('❌ SESSION_SECRET is using default value — refusing to start in production');
      process.exit(1);
    }
    console.warn('⚠️  SESSION_SECRET is using default value — set a strong random secret in production');
  }

  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
  });

  // HTTP security headers
  app.use(helmet({
    contentSecurityPolicy: false, // CSP managed separately or by frontend
    crossOriginEmbedderPolicy: false, // Allow embedding for OAuth flows
  }));

  // Trust proxy for secure cookies behind Nginx
  app.set('trust proxy', 1);

  // Twitter OAuth 1.0a requires session support
  app.use(
    session({
      secret: process.env.SESSION_SECRET || 'agentrix-secret-key-2025',
      resave: false,
      saveUninitialized: false,
      name: 'agentrix.sid', // Custom session cookie name
      cookie: {
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 3600000, // 1 hour
      },
    }),
  );

  app.useStaticAssets(join(process.cwd(), 'uploads'), {
    prefix: '/api/uploads/',
  });

  const corsOrigin = process.env.CORS_ORIGIN || 'http://localhost:3000,https://agentrix.top,https://www.agentrix.top,https://api.agentrix.top,tauri://localhost,https://tauri.localhost';
  const corsOrigins = corsOrigin.split(',').map(origin => origin.trim());

  // GPTs / ChatGPT Actions: if ALLOW_GPTs is set, add known OpenAI origins
  // rather than opening to the entire internet.
  if (process.env.ALLOW_GPTs === 'true') {
    const gptOrigins = [
      'https://chat.openai.com',
      'https://chatgpt.com',
    ];
    for (const o of gptOrigins) {
      if (!corsOrigins.includes(o)) corsOrigins.push(o);
    }
  }

  app.enableCors({
    origin: corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const { HttpExceptionFilter } = await import('./common/filters/http-exception.filter');
  app.useGlobalFilters(new HttpExceptionFilter());

  const { LoggingInterceptor } = await import('./common/interceptors/logging.interceptor');
  app.useGlobalInterceptors(new LoggingInterceptor());

  // 设置全局前缀，但排除 .well-known 路径（OAuth/OIDC 标准要求根路径）
  app.setGlobalPrefix('api', {
    exclude: ['.well-known/(.*)'],
  });

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

  const port = process.env.PORT || 3001;
  const host = process.env.HOST || '0.0.0.0';
  
  try {
    await app.listen(port, host);
    console.log(`🚀 Agentrix Backend is running on: http://${host}:${port}`);
    console.log(`📚 API Documentation: http://${host}:${port}/api/docs`);
  } catch (error: any) {
    console.error('❌ Failed to start server:', error.message);
    process.exit(1);
  }
}

bootstrap().catch((error) => {
  console.error('❌ Bootstrap failed:', error);
  process.exit(1);
});

