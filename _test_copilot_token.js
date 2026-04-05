const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Read .env
const envFile = fs.readFileSync(path.join(__dirname, 'backend', '.env'), 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
  const m = line.match(/^([A-Z_]+)=(.*)/);
  if (m) env[m[1]] = m[2];
});

// Same encryption as NestJS service
const secret = env.PROVIDER_ENCRYPTION_KEY || 'agentrix-default-provider-key-2026';
const encKey = crypto.scryptSync(secret, 'agentrix-salt', 32);

function decrypt(ciphertext) {
  const [ivHex, encHex, tagHex] = ciphertext.split(':');
  if (!ivHex || !encHex || !tagHex) throw new Error('Invalid encrypted data');
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
    "SELECT provider_id, base_url, selected_model, encrypted_api_key FROM user_provider_configs WHERE provider_id='copilot-subscription' AND is_active=true"
  );
  for (const row of res.rows) {
    const decrypted = decrypt(row.encrypted_api_key);
    console.log('provider_id:', row.provider_id);
    console.log('base_url:', row.base_url);
    console.log('selected_model:', row.selected_model);
    console.log('decrypted_key_prefix:', decrypted.substring(0, 8));
    console.log('decrypted_key_len:', decrypted.length);
    console.log('has_newline:', decrypted.includes('\n'));
    console.log('has_space:', decrypted.includes(' '));

    // Test the token against Copilot endpoint
    console.log('\n--- Testing against Copilot API ---');
    const testUrl = 'https://api.individual.githubcopilot.com/chat/completions';
    try {
      const resp = await fetch(testUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${decrypted}`,
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4',
          messages: [{ role: 'user', content: 'hi' }],
          max_tokens: 10,
        }),
      });
      console.log('Status:', resp.status, resp.statusText);
      const body = await resp.text();
      console.log('Body:', body.substring(0, 300));
    } catch (e) {
      console.log('Fetch error:', e.message);
    }
    console.log('---');
  }
  await client.end();
}

main().catch(e => { console.error(e); process.exit(1); });
