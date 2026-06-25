
const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

async function testBedrock() {
  const token = process.env.AWS_BEARER_TOKEN_BEDROCK;
  const proxy = process.env.HTTPS_PROXY || 'http://172.22.240.1:9098';
  const modelId = 'anthropic.claude-3-5-sonnet-20241022-v2:0';

  console.log('Testing Bedrock with token and proxy:', proxy);
  
  const httpsAgent = new HttpsProxyAgent(proxy);

  try {
    const response = await axios.post(
      `https://bedrock-runtime.us-east-1.amazonaws.com/model/${modelId}/invoke`,
      {
        anthropic_version: "bedrock-2023-05-31",
        max_tokens: 100,
        messages: [{ role: "user", content: "Hi" }]
      },
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        httpsAgent,
        proxy: false,
        timeout: 10000
      }
    );
    console.log('✅ Success! Response:', JSON.stringify(response.data.content[0].text));
  } catch (e) {
    console.error('❌ Failed:', e.message);
    if (e.response) {
      console.error('Status:', e.response.status);
      console.error('Data:', JSON.stringify(e.response.data));
    }
  }
}

testBedrock();
