
import { OpenAI } from 'openai';
import { ProxyAgent, setGlobalDispatcher } from 'undici';
import * as dotenv from 'dotenv';
dotenv.config();

async function testGroq() {
  const httpsProxy = process.env.HTTPS_PROXY || 'http://172.22.240.1:9098';
  if (httpsProxy) {
    const proxyAgent = new ProxyAgent(httpsProxy);
    setGlobalDispatcher(proxyAgent);
    console.log(`Using Proxy: ${httpsProxy}`);
  }

  const apiKey = process.env.OPENAI_API_KEY; // Try the OpenAI key which we know is working for others
  const baseURL = 'https://openai.api2d.net/v1';
  
  console.log(`Testing Groq-Compatibility with OpenAI SDK and BaseURL: ${baseURL}`);
  
  const groq = new OpenAI({
    apiKey,
    baseURL
  });

  try {
    const response = await groq.chat.completions.create({
      model: 'gpt-4o', // Use a known working model for API2D first
      messages: [{ role: 'user', content: 'Say hello' }]
    });
    console.log('✅ Success with gpt-4o:', response.choices[0].message.content);
  } catch (e) {
    console.error('❌ Failed with gpt-4o:', e.message);
  }

  try {
    const response = await groq.chat.completions.create({
      model: 'llama-3-groq-70b-tool-use',
      messages: [{ role: 'user', content: 'Say hello' }]
    });
    console.log('✅ Success with llama-3:', response.choices[0].message.content);
  } catch (e) {
    console.error('❌ Failed with llama-3:', e.message);
  }
}

testGroq();
