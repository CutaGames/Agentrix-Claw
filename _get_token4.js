const fs = require('fs');
const jwt = require('jsonwebtoken');
const { Client } = require('pg');

const env = fs.readFileSync('.env', 'utf8');
const secret = env.match(/JWT_SECRET=(.+)/)?.[1]?.trim();
const dbPass = env.match(/DB_PASSWORD=(.+)/)?.[1]?.trim();

(async () => {
  const c = new Client({ host: 'localhost', port: 5432, user: 'agentrix', password: dbPass, database: 'paymind' });
  await c.connect();
  
  const tables = await c.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE '%user%' ORDER BY table_name");
  console.log('User tables:', tables.rows.map(r => r.table_name));
  
  // Try common table names
  let userId, email;
  for (const t of ['users', 'app_user', 'account']) {
    try {
      const r = await c.query(`SELECT id, email FROM "${t}" LIMIT 1`);
      if (r.rows.length > 0) {
        userId = r.rows[0].id;
        email = r.rows[0].email;
        console.log(`Found in ${t}:`, r.rows[0]);
        break;
      }
    } catch(e) {}
  }
  
  if (!userId) {
    // List all tables to find the right one
    const all = await c.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name");
    console.log('All tables:', all.rows.map(r => r.table_name).join(', '));
  } else {
    const token = jwt.sign({ sub: userId, email }, secret, { expiresIn: '1h' });
    console.log('TOKEN=' + token);
    const i = await c.query('SELECT id, name FROM openclaw_instance WHERE "userId" = $1 LIMIT 3', [userId]);
    console.log('INSTANCES:', JSON.stringify(i.rows));
  }
  
  await c.end();
})();
