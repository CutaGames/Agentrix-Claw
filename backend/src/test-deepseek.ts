
import { DeepSeekIntegrationService } from './modules/ai-integration/deepseek/deepseek-integration.service';
import { ConfigService } from '@nestjs/config';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config();

async function testDeepSeek() {
  console.log('Testing DeepSeek Service...');
  const config = new ConfigService();
  const service = new DeepSeekIntegrationService(config);

  try {
    const response = await service.chatWithFunctions([
      { role: 'user', content: 'Say hello' }
    ]);
    console.log('✅ Success:', response.text);
  } catch (e) {
    console.error('❌ Failed:', e.message);
  }
}

testDeepSeek();
