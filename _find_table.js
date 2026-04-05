const fs = require('fs');
const path = require('path');
const envFile = fs.readFileSync(path.join(__dirname, 'backend', '.env'), 'utf8');
const env = {};
envFile.split('\n').forEach(line => {
  const m = line.match(/^([A-Z_]+)=(.*)/);
  if (m) env[m[1]] = m[2];
});

const { Client } = require(path.join(__dirname, 'backend', 'node_modules', 'pg'));
const c = new Client({
  host: env.DB_HOST, port: 5432, user: env.DB_USERNAME,
  password: env.DB_PASSWORD, database: env.DB_DATABASE,
  ssl: { rejectUnauthorized: false },
});

c.connect()
  .then(() => c.query("SELECT tablename FROM pg_tables WHERE tablename LIKE '%provider%' OR tablename LIKE '%ai_%'"))
  .then(r => { console.log(r.rows); return c.end(); })
  .catch(e => { console.error(e.message); c.end(); });
