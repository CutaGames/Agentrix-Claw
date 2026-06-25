// Check copilot-subscription config
const fs = require('fs');
const path = require('path');

// Read .env from backend/
const envFile = fs.readFileSync(path.join(__dirname, 'backend', '.env'), 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
});

const { Client } = require(path.join(__dirname, 'backend', 'node_modules', 'pg'));
const crypto = require('crypto');

const client = new Client({
  host: env.DB_HOST || 'localhost',
  port: parseInt(env.DB_PORT || '5432'),
  user: env.DB_USERNAME,
  password: env.DB_PASSWORD,
  database: env.DB_DATABASE,
  ssl: env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

function decrypt(encrypted) {
  const key = env.ENCRYPTION_KEY || env.JWT_SECRET || '';
  try {
    const parts = encrypted.split(':');
    if (parts.length === 2) {
      const iv = Buffer.from(parts[0], 'hex');
      const encryptedText = Buffer.from(parts[1], 'hex');
      const keyHash = crypto.createHash('sha256').update(key).digest();
      const decipher = crypto.createDecipheriv('aes-256-cbc', keyHash, iv);
      let decrypted = decipher.update(encryptedText);
      decrypted = Buffer.concat([decrypted, decipher.final()]);
      return decrypted.toString();
    }
    return encrypted;
  } catch (e) {
    return `[decrypt err: ${e.message}]`;
  }
}

async function main() {
  await client.connect();
  const res = await client.query(
    "SELECT id, user_id, provider_id, base_url, selected_model, encrypted_api_key FROM user_provider_configs WHERE provider_id='copilot-subscription' AND is_active=true"
  );
  for (const row of res.rows) {
    const decrypted = decrypt(row.encrypted_api_key);
    console.log('provider_id:', row.provider_id);
    console.log('base_url:', row.base_url);
    console.log('selected_model:', row.selected_model);
    console.log('encrypted_key_len:', row.encrypted_api_key.length);
    console.log('decrypted_key_prefix:', decrypted.substring(0, 10) + '...');
    console.log('decrypted_key_len:', decrypted.length);
    console.log('decrypted_has_newline:', decrypted.includes('\n'));
    console.log('decrypted_has_space:', decrypted.includes(' '));
    console.log('---');
  }
  await client.end();
}

main().catch(e => { console.error(e); process.exit(1); });
