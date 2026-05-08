const jwt = require('jsonwebtoken');
const { Client } = require('pg');
const fs = require('fs');
const env = fs.readFileSync('/home/ubuntu/Agentrix/backend/.env', 'utf8');
const get = (k) => env.match(new RegExp('^' + k + '=(.+)$', 'm'))?.[1]?.trim();
const secret = get('JWT_SECRET');
const dbName = get('DB_NAME') || get('DB_DATABASE') || 'paymind';
(async () => {
  const c = new Client({
    host: get('DB_HOST') || 'localhost',
    port: parseInt(get('DB_PORT') || '5432', 10),
    user: get('DB_USERNAME'),
    password: get('DB_PASSWORD'),
    database: dbName,
  });
  await c.connect();
  const r = await c.query("SELECT id, email FROM users WHERE email='zhouyachi2023@gmail.com' LIMIT 1");
  await c.end();
  if (!r.rows.length) { console.log('NO_USER'); return; }
  const t = jwt.sign({ sub: r.rows[0].id, email: r.rows[0].email, userId: r.rows[0].id }, secret, { expiresIn: '1h' });
  console.log(t);
})().catch(e => { console.error(e.message); process.exit(1); });
