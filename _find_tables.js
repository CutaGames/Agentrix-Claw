const { Client } = require('pg');
(async () => {
  const c = new Client({ host: 'localhost', port: 5432, user: 'agentrix', database: 'paymind' });
  await c.connect();
  
  // Find user tables
  const tables = await c.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name");
  const userTables = tables.rows.filter(r => r.table_name.includes('user'));
  console.log('User tables:', userTables);
  
  // Try users table  
  for (const t of ['users', 'app_user', 'account', 'auth_user']) {
    try {
      const r = await c.query(`SELECT id, email FROM "${t}" LIMIT 1`);
      if (r.rows.length > 0) {
        console.log(`Found users in ${t}:`, r.rows);
      }
    } catch(e) {}
  }
  
  // All tables
  console.log('All tables:', tables.rows.map(r => r.table_name).join(', '));
  
  await c.end();
})();
