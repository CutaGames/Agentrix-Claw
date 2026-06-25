import { NestFactory } from '@nestjs/core';
import { ProxyAgent, setGlobalDispatcher } from 'undici';
import { NestExpressApplication } from '@nestjs/platform-express';
import { HqStandaloneModule } from './modules/hq/hq.standalone.module';

async function bootstrap() {
  console.log('🛸 Starting Agentrix HQ Pilot (Standalone Control Center)...');
  
  // 配置全局代理 (仅在显式要求时启用，暂时禁用以排除 Gemini 连接问题)
  const httpsProxy = process.env.ENABLE_HQ_PROXY === 'true' ? (process.env.HTTPS_PROXY || process.env.https_proxy || 
                     process.env.HTTP_PROXY || process.env.http_proxy) : null;
  
  if (httpsProxy) {
    try {
      console.log(`🌐 HQ Pilot Proxy active: ${httpsProxy}`);
      const proxyAgent = new ProxyAgent(httpsProxy);
      setGlobalDispatcher(proxyAgent);
    } catch (e) {}
  }

  const app = await NestFactory.create<NestExpressApplication>(HqStandaloneModule, {
    logger: ['error', 'warn', 'log'],
  });

  // 这里的跨域配置参考主后端，确保护理端 (4000) 能稳定访问
  app.enableCors({
    origin: true, // 开发环境下允许所有来源，避免代理引起的 localhost/127.0.0.1 识别不一致
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
  });

  app.setGlobalPrefix('api');

  const port = process.env.HQ_PORT || 3005;
  await app.listen(port, '0.0.0.0');
  
  console.log(`✅ HQ Pilot is running on: http://0.0.0.0:${port}`);
  console.log(`🚀 This terminal is now the PROJECT COMMAND CENTER. You can rebuild the main backend without affecting this console.`);
}

bootstrap();
