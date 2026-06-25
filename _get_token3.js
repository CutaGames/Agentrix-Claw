const fs = require('fs');
const jwt = require('jsonwebtoken');
const env = fs.readFileSync('.env', 'utf8');
const secret = env.match(/JWT_SECRET=(.+)/)?.[1]?.trim();

// Parse individual DB vars
const dbHost = env.match(/TYPEORM_HOST=(.+)/)?.[1]?.trim() || env.match(/DB_HOST=(.+)/)?.[1]?.trim() || 'localhost';
const dbPort = env.match(/TYPEORM_PORT=(.+)/)?.[1]?.trim() || env.match(/DB_PORT=(.+)/)?.[1]?.trim() || '5432';
const dbUser = env.match(/TYPEORM_USERNAME=(.+)/)?.[1]?.trim() || env.match(/DB_USERNAME=(.+)/)?.[1]?.trim() || 'postgres';
const dbPass = env.match(/TYPEORM_PASSWORD=(.+)/)?.[1]?.trim() || env.match(/DB_PASSWORD=(.+)/)?.[1]?.trim() || '';
const dbName = env.match(/TYPEORM_DATABASE=(.+)/)?.[1]?.trim() || env.match(/DB_DATABASE=(.+)/)?.[1]?.trim() || 'agentrix';

console.log('DB config:', { host: dbHost, port: dbPort, user: dbUser, database: dbName });

const { Client } = require('pg');

(async () => {
  const c = new Client({
    host: dbHost,
    port: parseInt(dbPort),
    user: dbUser,
    password: dbPass,
    database: dbName,
  });
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
