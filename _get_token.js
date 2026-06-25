const jwt = require('jsonwebtoken');
const fs = require('fs');
const env = fs.readFileSync('/home/ubuntu/Agentrix/backend/.env', 'utf8');
const secret = env.match(/JWT_SECRET=(.+)/)?.[1]?.trim();
if (!secret) { console.log('no JWT_SECRET'); process.exit(1); }

// Find a real userId from DB ENV
const dbUrl = env.match(/DATABASE_URL=(.+)/)?.[1]?.trim();
console.log('JWT_SECRET found, DB_URL=' + (dbUrl ? 'yes' : 'no'));

// Try to query DB for first user
const { Client } = require('pg');
(async () => {
  const client = new Client({ connectionString: dbUrl });
  await client.connect();
  const res = await client.query("SELECT id, email FROM \"user\" LIMIT 3");
  console.log('Users:', res.rows);
  if (res.rows.length > 0) {
    const userId = res.rows[0].id;
    const email = res.rows[0].email;
    const token = jwt.sign({ sub: userId, email }, secret, { expiresIn: '1h' });
    console.log('TOKEN=' + token);
  }
  
  // Also find the instance ID
  const instances = await client.query("SELECT id, name FROM openclaw_instance LIMIT 3");
  console.log('Instances:', instances.rows);
  
  await client.end();
})();
