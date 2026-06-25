const fs = require('fs');
const path = require('path');
const envFile = fs.readFileSync(path.join(__dirname, 'backend', '.env'), 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
  const m = line.match(/^([A-Z_]+)=(.*)/);
  if (m) env[m[1]] = m[2];
});
const { Client } = require(path.join(__dirname, 'backend', 'node_modules', 'pg'));
const c = new Client({ host: env.DB_HOST, port: 5432, user: env.DB_USERNAME, password: env.DB_PASSWORD, database: env.DB_DATABASE, ssl: { rejectUnauthorized: false } });

c.connect().then(async () => {
  const cnt = await c.query('SELECT COUNT(*) as cnt FROM user_provider_configs');
  console.log('total rows:', cnt.rows[0].cnt);
  const provs = await c.query('SELECT DISTINCT provider_id, is_active FROM user_provider_configs');
  console.log('providers:', provs.rows);
  const cop = await c.query("SELECT id, provider_id, base_url, is_active, selected_model, LENGTH(encrypted_api_key) as keylen FROM user_provider_configs WHERE provider_id ILIKE '%copilot%' OR provider_id ILIKE '%chatgpt%'");
  console.log('copilot/chatgpt configs:', cop.rows);
  await c.end();
}).catch(e => { console.error(e.message); c.end(); });
