const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const envFile = fs.readFileSync(path.join(__dirname, 'backend', '.env'), 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
  const m = line.match(/^([A-Z_]+)=(.*)/);
  if (m) env[m[1]] = m[2];
});

const secret = env.PROVIDER_ENCRYPTION_KEY || 'agentrix-default-provider-key-2026';
const encKey = crypto.scryptSync(secret, 'agentrix-salt', 32);

function decrypt(ciphertext) {
  const [ivHex, encHex, tagHex] = ciphertext.split(':');
  if (!ivHex || !encHex || !tagHex) throw new Error('Invalid');
  const decipher = crypto.createDecipheriv('aes-256-gcm', encKey, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return decipher.update(Buffer.from(encHex, 'hex')) + decipher.final('utf8');
}

const { Client } = require(path.join(__dirname, 'backend', 'node_modules', 'pg'));
const client = new Client({
  host: env.DB_HOST, port: 5432, user: env.DB_USERNAME,
  password: env.DB_PASSWORD, database: env.DB_DATABASE,
  ssl: { rejectUnauthorized: false },
});

async function main() {
  await client.connect();

  // First: find ALL copilot configs
  const all = await client.query(
    "SELECT id, user_id, provider_id, base_url, selected_model, is_active, LEFT(encrypted_api_key, 20) as key_start, LENGTH(encrypted_api_key) as key_len FROM user_provider_configs WHERE provider_id LIKE '%copilot%'"
  );
  console.log('=== All copilot configs ===');
  for (const row of all.rows) {
    console.log(JSON.stringify(row));
  }

  // Then: find active one and decrypt
  const res = await client.query(
    "SELECT encrypted_api_key, base_url FROM user_provider_configs WHERE provider_id LIKE '%copilot%' ORDER BY is_active DESC LIMIT 1"
  );
  if (res.rows.length === 0) { console.log('No copilot config at all'); await client.end(); return; }

  const token = decrypt(res.rows[0].encrypted_api_key);
  const baseUrl = res.rows[0].base_url || 'https://api.individual.githubcopilot.com';
  console.log('\nToken prefix:', token.substring(0, 10), 'len:', token.length);
  console.log('Base URL:', baseUrl);

  if (token === '__saved__' || token.length < 10) {
    console.log('ERROR: Token is still placeholder.');
    await client.end();
    return;
  }

  // List models
  console.log('\n=== GET /models ===');
  try {
    const resp = await fetch(`${baseUrl}/models`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    console.log('Status:', resp.status);
    const body = await resp.json();
    if (body.data) {
      for (const m of body.data) {
        const caps = m.capabilities || {};
        console.log(`  ${m.id} | family=${caps.family || ''} | type=${caps.type || ''} | limits=${JSON.stringify(caps.limits || {}).substring(0,80)}`);
      }
    } else {
      console.log(JSON.stringify(body).substring(0, 500));
    }
  } catch (e) { console.log('Error:', e.message); }

  // Test specific models
  const testModels = ['gpt-4.1', 'gpt-4o', 'gpt-5.4', 'claude-3.5-sonnet', 'claude-sonnet-4', 'claude-sonnet-4.5', 'claude-opus-4', 'claude-opus-4.5', 'gemini-2.0-flash', 'gemini-2.5-pro', 'o4-mini', 'o3-mini'];
  console.log('\n=== Test model chat ===');
  for (const model of testModels) {
    try {
      const resp = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ model, messages: [{ role: 'user', content: 'say ok' }], max_tokens: 5 }),
      });
      if (resp.status === 200) {
        const data = await resp.json();
        console.log(`  ✅ ${model} -> 200 (actual model: ${data.model || '?'})`);
      } else {
        const text = await resp.text();
        console.log(`  ❌ ${model} -> ${resp.status}: ${text.substring(0, 100)}`);
      }
    } catch (e) {
      console.log(`  ❌ ${model} -> Net error: ${e.message}`);
    }
  }

  await client.end();
}

main().catch(e => { console.error(e); process.exit(1); });
