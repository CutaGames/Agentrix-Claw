
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { HttpsProxyAgent } = require('https-proxy-agent');
const nodeFetch = require('node-fetch'); // wait, if not available, I'll use a hack or dynamic import
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

async function testGeminiProxy() {
  const apiKey = process.env.GEMINI_API_KEY;
  const proxy = process.env.HTTPS_PROXY || 'http://172.22.240.1:9098';
  
  console.log('Testing Gemini with proxy:', proxy);

  try {
    // Dynamic import for node-fetch if needed, but let's see if we can just wrap native fetch
    const agent = new HttpsProxyAgent(proxy);
    
    // For Node 18+, native fetch is global. 
    // Google SDK uses global fetch if available.
    // We can wrap it.
    const originalFetch = global.fetch;
    const proxiedFetch = (url, init) => {
      return originalFetch(url, {
        ...init,
        // For undici (Node native fetch), we use 'dispatcher' instead of 'agent'
        // But HttpsProxyAgent is for http module. 
        // Let's use undici's ProxyAgent
      });
    };

    // Actually, let's try a different approach.
    // Use undici directly as it's built into Node.
    const { ProxyAgent, fetch } = require('undici');
    const dispatcher = new ProxyAgent({ uri: proxy });
    
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel(
      { model: "gemini-1.5-flash" },
      { apiVersion: 'v1', fetch: (url, init) => fetch(url, { ...init, dispatcher }) }
    );

    const result = await model.generateContent("Hi");
    const response = await result.response;
    console.log('✅ Success! Gemini response:', response.text());
  } catch (e) {
    console.error('❌ Failed:', e.message);
  }
}

testGeminiProxy();
