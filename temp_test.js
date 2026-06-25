// Test the full chat flow as a user with Bedrock credentials
const http = require('http');

const userId = '6e10af3f-dc63-416b-a205-9914b10a2a1e';

// First, get a JWT token
function makeRequest(path, method, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : '';
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    
    const req = http.request({
      hostname: 'localhost',
      port: 3000,
      path: '/api' + path,
      method: method || 'GET',
      headers,
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(body) }); }
        catch { resolve({ status: res.statusCode, data: body }); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

(async () => {
  // Test 1: Check available models (requires auth, but let's try catalog first)
  console.log('=== Test 1: Catalog ===');
  const catalogResp = await makeRequest('/ai-providers/catalog');
  if (catalogResp.status === 200) {
    const bedrock = catalogResp.data.find(p => p.id === 'bedrock');
    if (bedrock) {
      console.log('Bedrock models:');
      bedrock.models.forEach(m => console.log('  ' + m.id + ' -> ' + m.label));
    }
  } else {
    console.log('Catalog requires auth (expected):', catalogResp.status);
  }

  // Test 2: Direct claude/chat endpoint (the 3rd fallback path)
  // This should attempt to resolve user credentials from JWT
  console.log('\n=== Test 2: POST /claude/chat ===');
  const chatResp = await makeRequest('/claude/chat', 'POST', {
    messages: [{ role: 'user', content: 'Say hello in 3 words' }],
    context: { userId },
    options: { model: 'us.anthropic.claude-sonnet-4-20250514-v1:0', maxTokens: 50 },
  });
  console.log('Status:', chatResp.status);
  if (chatResp.data && chatResp.data.text) {
    console.log('Response:', chatResp.data.text.slice(0, 100));
  } else {
    console.log('Data:', JSON.stringify(chatResp.data).slice(0, 200));
  }
})();
