const fs = require('fs');
const jwt = require('jsonwebtoken');
const { Client } = require('pg');

const env = fs.readFileSync('.env', 'utf8');
const secret = env.match(/JWT_SECRET=(.+)/)?.[1]?.trim();
const dbPass = env.match(/DB_PASSWORD=(.+)/)?.[1]?.trim();

(async () => {
  const c = new Client({ host: 'localhost', port: 5432, user: 'agentrix', password: dbPass, database: 'paymind' });
  await c.connect();
  
  // Find users
  const users = await c.query('SELECT id, email FROM users LIMIT 5');
  console.log('Users:', JSON.stringify(users.rows));
  
  // Find instance tables
  const inst = await c.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE '%instance%'");
  console.log('Instance tables:', inst.rows.map(r => r.table_name));
  
  // Find the instance e6c7c0c5-63fa-4972-b54c-c73e209e0013
  for (const t of inst.rows) {
    try {
      const r = await c.query(`SELECT * FROM "${t.table_name}" WHERE id = $1`, ['e6c7c0c5-63fa-4972-b54c-c73e209e0013']);
      if (r.rows.length > 0) {
        console.log(`Found instance in ${t.table_name}:`, JSON.stringify(r.rows[0]).substring(0, 500));
      }
    } catch(e) {}
  }
  
  // Generate tokens for each user  
  for (const u of users.rows) {
    const token = jwt.sign({ sub: u.id, email: u.email }, secret, { expiresIn: '1h' });
    console.log(`User ${u.id}: TOKEN=${token}`);
  }
  
  await c.end();
})();
