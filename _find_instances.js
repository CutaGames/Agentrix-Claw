const fs = require('fs');
const jwt = require('jsonwebtoken');
const { Client } = require('pg');

const env = fs.readFileSync('.env', 'utf8');
const secret = env.match(/JWT_SECRET=(.+)/)?.[1]?.trim();
const dbPass = env.match(/DB_PASSWORD=(.+)/)?.[1]?.trim();

(async () => {
  const c = new Client({ host: 'localhost', port: 5432, user: 'agentrix', password: dbPass, database: 'paymind' });
  await c.connect();
  
  // Find all users and their instances
  const users = await c.query('SELECT id, email, phone FROM users LIMIT 10');
  console.log('Users:', JSON.stringify(users.rows));
  
  // Find tables with instance
  const inst = await c.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE '%instance%'");
  console.log('Instance tables:', inst.rows.map(r => r.table_name));
  
  // Try to find instances
  for (const t of inst.rows) {
    try {
      const r = await c.query(`SELECT * FROM "${t.table_name}" LIMIT 2`);
      if (r.rows.length > 0) {
        console.log(`Table ${t.table_name}:`, JSON.stringify(r.rows[0]).substring(0, 300));
      }
    } catch(e) { console.log(`Error on ${t.table_name}: ${e.message}`); }
  }
  
  // Generate tokens for each user
  for (const u of users.rows) {
    const token = jwt.sign({ sub: u.id, email: u.email }, secret, { expiresIn: '1h' });
    console.log(`User ${u.id} (${u.email || u.phone}): TOKEN=${token.substring(0, 50)}...`);
  }
  
  await c.end();
})();
