const jwt = require('jsonwebtoken');
const fs = require('fs');
const env = fs.readFileSync('.env', 'utf8');
const secret = env.match(/JWT_SECRET=(.+)/)?.[1]?.trim();
const { Client } = require('pg');
const dbUrl = env.match(/DATABASE_URL=(.+)/)?.[1]?.trim();

(async () => {
  const c = new Client({ connectionString: dbUrl });
  await c.connect();
  const r = await c.query('SELECT id, email FROM "user" LIMIT 3');
  console.log('USERS:', JSON.stringify(r.rows));
  if (r.rows[0]) {
    const t = jwt.sign({ sub: r.rows[0].id, email: r.rows[0].email }, secret, { expiresIn: '1h' });
    console.log('TOKEN=' + t);
    const i = await c.query('SELECT id, name FROM openclaw_instance WHERE "userId" = $1 LIMIT 3', [r.rows[0].id]);
    console.log('INSTANCES:', JSON.stringify(i.rows));
  }
  await c.end();
})();
