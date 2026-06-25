// Test Copilot API models directly from server
const { DataSource } = require('typeorm');
const crypto = require('crypto');

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'agentrix-encryption-key-2024-secure';

function decrypt(encrypted) {
  try {
    const parts = encrypted.split(':');
    if (parts.length !== 3) return null;
    const [ivHex, authTagHex, encryptedHex] = parts;
    const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (e) { return null; }
}

async function main() {
  const ds = new DataSource({
    type: 'postgres', host: 'localhost', port: 5432,
    username: 'agentrix', password: 'agentrix_secure_2024', database: 'paymind',
  });
  await ds.initialize();
  
  // Get copilot config
  const rows = await ds.query(
    "SELECT encrypted_api_key FROM user_provider_configs WHERE provider_id = 'copilot-subscription' LIMIT 1"
  );
  
  let token;
  if (rows.length > 0 && rows[0].encrypted_api_key) {
    token = decrypt(rows[0].encrypted_api_key);
    console.log('Token from DB:', token ? token.substring(0, 10) + '...' : 'decrypt failed');
  }
  
  if (!token) {
    // Try getting from env or use the one from the latest logs
    console.log('No copilot token in DB. Checking server logs for recent test token...');
    await ds.destroy();
    return;
  }
  
  await ds.destroy();
  
  const BASE = 'https://api.individual.githubcopilot.com';
  
  // Step 1: List available models
  console.log('\n=== Listing available models ===');
  const modelsResp = await fetch(`${BASE}/models`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  if (!modelsResp.ok) {
    console.error('Failed to list models:', modelsResp.status, await modelsResp.text());
    return;
  }
  const modelsData = await modelsResp.json();
  const modelIds = (modelsData.data || []).map(m => m.id).sort();
  console.log(`Found ${modelIds.length} models:`);
  modelIds.forEach(m => console.log(`  - ${m}`));
  
  // Step 2: Test key models
  const testModels = [
    'claude-sonnet-4.6', 'claude-opus-4.6', 'gpt-5.4', 'gpt-5.4-mini',
    'claude-haiku-4.5', 'gemini-3.1-pro-preview', 'gemini-3-flash-preview',
    'gpt-4.1', 'gpt-5-mini', 'claude-sonnet-4', 'gemini-2.5-pro',
  ];
  
  console.log('\n=== Testing chat/completions with each model ===');
  for (const model of testModels) {
    const inList = modelIds.includes(model);
    try {
      const start = Date.now();
      const resp = await fetch(`${BASE}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ model, max_tokens: 10, messages: [{ role: 'user', content: 'Say hello' }] }),
        signal: AbortSignal.timeout(15000),
      });
      const elapsed = Date.now() - start;
      if (resp.ok) {
        const data = await resp.json();
        const reply = data.choices?.[0]?.message?.content?.substring(0, 50);
        console.log(`  ✅ ${model} (${elapsed}ms) [inList=${inList}] -> "${reply}"`);
      } else {
        const errText = await resp.text();
        console.log(`  ❌ ${model} (${elapsed}ms) [inList=${inList}] -> HTTP ${resp.status}: ${errText.substring(0, 150)}`);
      }
    } catch (e) {
      console.log(`  ❌ ${model} [inList=${inList}] -> ${e.message}`);
    }
  }
}

main().catch(e => console.error(e));
