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
  const res = await client.query(
    "SELECT encrypted_api_key, base_url FROM user_provider_configs WHERE provider_id='copilot-subscription' AND is_active=true LIMIT 1"
  );
  if (res.rows.length === 0) { console.log('No copilot config found'); await client.end(); return; }
  const token = decrypt(res.rows[0].encrypted_api_key);
  const baseUrl = res.rows[0].base_url || 'https://api.individual.githubcopilot.com';
  console.log('Token prefix:', token.substring(0, 8), 'len:', token.length);
  console.log('Base URL:', baseUrl);
  
  if (token === '__saved__' || token.length < 10) {
    console.log('ERROR: Token is placeholder __saved__ or too short. User needs to re-save.');
    await client.end();
    return;
  }

  // 1. List available models
  console.log('\n=== GET /models ===');
  try {
    const resp = await fetch(`${baseUrl}/models`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    console.log('Status:', resp.status);
    const body = await resp.json();
    if (body.data) {
      for (const m of body.data) {
        console.log(`  ${m.id} | ${m.name || ''} | version=${m.version || ''}`);
      }
    } else {
      console.log(JSON.stringify(body).substring(0, 500));
    }
  } catch (e) { console.log('Error:', e.message); }

  // 2. Test specific models
  const testModels = [
    'gpt-4.1',
    'gpt-5.4',
    'claude-sonnet-4',
    'claude-sonnet-4.6',
    'claude-opus-4.5',
    'claude-opus-4.6',
    'gemini-2.5-pro',
    'gemini-3.1-pro',
    'o4-mini',
  ];
  
  console.log('\n=== Test model names ===');
  for (const model of testModels) {
    try {
      const resp = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: 'hi' }],
          max_tokens: 5,
        }),
      });
      const status = resp.status;
      if (status === 200) {
        const data = await resp.json();
        console.log(`  ✅ ${model} -> ${status} (actual: ${data.model || '?'})`);
      } else {
        const text = await resp.text();
        const errMsg = text.substring(0, 120);
        console.log(`  ❌ ${model} -> ${status}: ${errMsg}`);
      }
    } catch (e) {
      console.log(`  ❌ ${model} -> Error: ${e.message}`);
    }
  }

  await client.end();
}

main().catch(e => { console.error(e); process.exit(1); });
