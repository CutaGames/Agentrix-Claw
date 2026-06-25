import { NestFactory } from '@nestjs/core';
import { HqStandaloneModule } from './modules/hq/hq.standalone.module';
import { HqService } from './modules/hq/hq.service';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(HqStandaloneModule);
  const hqService = app.get(HqService);
  
  const agentId = 'AGENT-GROWTH-001';
  const messages = [{ role: 'user', content: '说说看你对Agentrix了解多少？如何做增长' }];
  
  console.log(`Testing HQ Dialogue for Agent: ${agentId}`);
  try {
    const response = await hqService.processHqChat(agentId, messages);
    console.log('--- RESPONSE ---');
    console.log(JSON.stringify(response, null, 2));
  } catch (err) {
    console.error('--- ERROR ---');
    console.error(err);
  } finally {
    await app.close();
  }
}

bootstrap();
