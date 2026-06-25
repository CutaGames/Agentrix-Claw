const http = require('http');
const PORT = parseInt(process.env.PORT || '3001');

function post(path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request({
      hostname: 'localhost', port: 3000, path, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': data.length }
    }, (res) => {
      let b = ''; res.on('data', c => b += c); res.on('end', () => {
        try { resolve(JSON.parse(b)); } catch { resolve(b); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function get(path, token) {
  return new Promise((resolve, reject) => {
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const req = http.request({
      hostname: 'localhost', port: 3000, path, method: 'GET', headers
    }, (res) => {
      let b = ''; res.on('data', c => b += c); res.on('end', () => {
        try { resolve(JSON.parse(b)); } catch { resolve(b); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function del(path, token) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: 'localhost', port: 3000, path, method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    }, (res) => {
      let b = ''; res.on('data', c => b += c); res.on('end', () => {
        try { resolve(JSON.parse(b)); } catch { resolve(b); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function authPost(path, body, token) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request({
      hostname: 'localhost', port: 3000, path, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': data.length, Authorization: `Bearer ${token}` }
    }, (res) => {
      let b = ''; res.on('data', c => b += c); res.on('end', () => {
        try { resolve(JSON.parse(b)); } catch { resolve(b); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function main() {
  console.log('=== P6+P7 E2E Test Suite ===\n');

  // Login
  console.log('1. Authentication...');
  let token;
  const loginResp = await post('/api/auth/login', { email: 'test-e2e@agentrix.app', password: 'TestE2E1234!' });
  if (loginResp.access_token) {
    token = loginResp.access_token;
    console.log(`   OK (token: ${token.substring(0, 20)}...)`);
  } else {
    console.log('   Login failed, trying guest...');
    const guestResp = await post('/api/auth/guest', {});
    if (guestResp.access_token) {
      token = guestResp.access_token;
      console.log(`   OK guest (token: ${token.substring(0, 20)}...)`);
    } else {
      console.log('   FAIL: No auth available. Responses:', JSON.stringify(loginResp).substring(0, 100), JSON.stringify(guestResp).substring(0, 100));
      process.exit(1);
    }
  }

  let passed = 0, failed = 0;
  function check(label, ok) {
    if (ok) { passed++; console.log(`   PASS: ${label}`); }
    else { failed++; console.log(`   FAIL: ${label}`); }
  }

  // 2. Hooks CRUD
  console.log('\n2. Hooks CRUD...');
  const hooks = await get('/api/hooks', token);
  check('List hooks', Array.isArray(hooks));

  const hookCreate = await authPost('/api/hooks', {
    eventType: 'MESSAGE_PRE', handlerType: 'WEBHOOK',
    handler: 'https://example.com/hook', priority: 10, config: { timeout: 5000 }
  }, token);
  check('Create hook', hookCreate.id);

  if (hookCreate.id) {
    const hookGet = await get(`/api/hooks/${hookCreate.id}`, token);
    check('Get hook', hookGet.id === hookCreate.id);

    const hookToggle = await authPost(`/api/hooks/${hookCreate.id}/toggle`, {}, token);
    check('Toggle hook', hookToggle.id || hookToggle.ok !== undefined);

    const hookDel = await del(`/api/hooks/${hookCreate.id}`, token);
    check('Delete hook', hookDel.ok);
  }

  // 3. Slash Commands CRUD
  console.log('\n3. Slash Commands CRUD...');
  const cmds = await get('/api/slash-commands', token);
  check('List commands', Array.isArray(cmds));

  const cmdCreate = await authPost('/api/slash-commands', {
    name: 'test_greet', description: 'Test greeting', promptTemplate: 'Please greet {{args}} warmly'
  }, token);
  check('Create command', cmdCreate.id);

  const cmdResolve = await authPost('/api/slash-commands/test_greet/resolve', { args: 'World' }, token);
  check('Resolve command', cmdResolve.prompt === 'Please greet World warmly');
  console.log(`   Resolved prompt: "${cmdResolve.prompt}"`);

  if (cmdCreate.id) {
    const cmdDel = await del(`/api/slash-commands/${cmdCreate.id}`, token);
    check('Delete command', cmdDel.ok);
  }

  // 4. MCP Servers CRUD
  console.log('\n4. MCP Servers CRUD...');
  const mcps = await get('/api/mcp-servers', token);
  check('List MCP servers', Array.isArray(mcps));

  const mcpCreate = await authPost('/api/mcp-servers', {
    name: 'test-mcp-server', transport: 'HTTP', url: 'https://example.com/mcp'
  }, token);
  check('Create MCP server', mcpCreate.id);

  const mcpTools = await get('/api/mcp-servers/tools/all', token);
  check('Get all MCP tools', Array.isArray(mcpTools));

  if (mcpCreate.id) {
    const mcpDel = await del(`/api/mcp-servers/${mcpCreate.id}`, token);
    check('Delete MCP server', mcpDel.ok);
  }

  // 5. Session Export/Fork/Search
  console.log('\n5. Session Export/Fork/Search...');
  const sessionsResp = await get('/api/agent-intelligence/sessions', token);
  check('List sessions', sessionsResp && (Array.isArray(sessionsResp.sessions) || Array.isArray(sessionsResp)));
  const sessionsList = Array.isArray(sessionsResp) ? sessionsResp : (sessionsResp.sessions || []);
  console.log(`   Sessions: ${sessionsList.length} found`);

  if (sessionsList.length > 0) {
    const sid = sessionsList[0].id;
    console.log(`   Using session: ${sid}`);

    const mdExport = await get(`/api/agent-intelligence/sessions/${sid}/export?format=markdown`, token);
    check('Export markdown', typeof mdExport === 'object' && (mdExport.content || mdExport.markdown));
    console.log(`   Export result keys: ${Object.keys(mdExport || {}).join(', ')}`);

    const jsonExport = await get(`/api/agent-intelligence/sessions/${sid}/export?format=json`, token);
    check('Export JSON', typeof jsonExport === 'object' && jsonExport.session);

    const ctxUsage = await get(`/api/agent-intelligence/sessions/${sid}/context-usage`, token);
    check('Context usage', ctxUsage.usedTokens !== undefined || ctxUsage.limit !== undefined);
    console.log(`   Context: used=${ctxUsage.usedTokens}, limit=${ctxUsage.limit}, pct=${ctxUsage.percentUsed}`);

    const fork = await authPost(`/api/agent-intelligence/sessions/${sid}/fork`, { messageIndex: 0 }, token);
    check('Fork session', fork.sessionId);
    console.log(`   Forked to: ${fork.sessionId}`);
  }

  const searchResp = await get('/api/agent-intelligence/search?q=hello', token);
  check('Search messages', searchResp && (Array.isArray(searchResp.results) || Array.isArray(searchResp)));
  const searchResults = Array.isArray(searchResp) ? searchResp : (searchResp.results || []);
  console.log(`   Search results: ${searchResults.length}`);

  // Summary
  console.log(`\n=== Results: ${passed} passed, ${failed} failed out of ${passed + failed} tests ===`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => { console.error('Unhandled:', e); process.exit(1); });
