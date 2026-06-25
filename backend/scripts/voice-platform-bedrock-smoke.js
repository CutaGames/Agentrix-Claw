const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { Client } = require('pg');
const { io } = require('socket.io-client');

const backendDir = path.resolve(__dirname, '..');
const runId = `${new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)}_voice_platform_bedrock`;
const appLogPath = path.join(backendDir, `smoke_${runId}_app.log`);
const httpLogPath = path.join(backendDir, `smoke_${runId}_http.log`);
const socketLogPath = path.join(backendDir, `smoke_${runId}_socket.log`);
const provisionBodyPath = path.join(backendDir, `smoke_${runId}_provision.json`);
const instanceBodyPath = path.join(backendDir, `smoke_${runId}_instance.json`);

const appLog = fs.createWriteStream(appLogPath, { flags: 'a' });
const httpLog = fs.createWriteStream(httpLogPath, { flags: 'a' });
const socketLog = fs.createWriteStream(socketLogPath, { flags: 'a' });

function logHttp(line) {
  httpLog.write(`${line}\n`);
  process.stdout.write(`${line}\n`);
}

function logSocket(event, payload) {
  const line = JSON.stringify({ ts: new Date().toISOString(), event, payload: payload ?? null });
  socketLog.write(`${line}\n`);
}

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const env = {};
  const text = fs.readFileSync(filePath, 'utf8').replace(/\r/g, '');
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[match[1]] = value;
  }
  return env;
}

function base64url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function signJwt(userId, jwtSecret) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64url(JSON.stringify({ sub: String(userId), iat: now, exp: now + 3600 }));
  const message = `${header}.${body}`;
  const signature = crypto
    .createHmac('sha256', jwtSecret)
    .update(message)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  return `${message}.${signature}`;
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { response, text, json };
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServerReady(baseUrl, backendProcess) {
  for (let attempt = 1; attempt <= 60; attempt += 1) {
    if (backendProcess.exitCode !== null) {
      throw new Error(`Backend exited early with code ${backendProcess.exitCode}`);
    }

    let healthStatus = 'ERR';
    let metricsStatus = 'ERR';
    try {
      const health = await fetch(`${baseUrl}/api/health`, { signal: AbortSignal.timeout(5000) });
      healthStatus = String(health.status);
    } catch {}

    try {
      const metrics = await fetch(`${baseUrl}/api/voice/metrics/health`, { signal: AbortSignal.timeout(5000) });
      metricsStatus = String(metrics.status);
    } catch {}

    logHttp(`PROBE attempt=${attempt} health=${healthStatus} metrics=${metricsStatus}`);
    if (healthStatus === '200' && metricsStatus === '200') {
      return;
    }

    await sleep(3000);
  }

  throw new Error('SERVER_NOT_READY');
}

async function findEligibleUser(env) {
  const client = new Client({
    host: process.env.DB_HOST || env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || env.DB_PORT || 5432),
    user: process.env.DB_USERNAME || process.env.DB_USER || env.DB_USERNAME || env.DB_USER,
    password: process.env.DB_PASSWORD || env.DB_PASSWORD,
    database: process.env.DB_DATABASE || env.DB_DATABASE || 'paymind',
    ssl: String(process.env.DB_SSL || env.DB_SSL || '').toLowerCase() === 'true'
      ? { rejectUnauthorized: false }
      : undefined,
  });

  await client.connect();
  try {
    const result = await client.query(`
      select u.id, u.email
      from users u
      where not exists (
        select 1
        from openclaw_instances o
        where o."userId" = u.id
          and o."instanceType" = 'cloud'
          and o.status in ('active', 'provisioning')
      )
      order by u.id asc
      limit 1
    `);

    if (!result.rows.length) {
      throw new Error('NO_ELIGIBLE_USER');
    }

    return result.rows[0];
  } finally {
    await client.end();
  }
}

function startBackend(env) {
  const child = spawn('node', ['dist/main.js'], {
    cwd: backendDir,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout.on('data', (chunk) => appLog.write(chunk));
  child.stderr.on('data', (chunk) => appLog.write(chunk));
  return child;
}

async function stopBackend(child) {
  if (!child || child.exitCode !== null) {
    return;
  }

  child.kill('SIGTERM');
  await sleep(1000);
  if (child.exitCode === null) {
    child.kill('SIGKILL');
  }
}

async function runSocketVoiceTest(baseUrl, token, instanceId) {
  return await new Promise((resolve) => {
    const sessionId = `smoke-${Date.now()}`;
    const socket = io(`${baseUrl}/voice`, {
      auth: { token },
      transports: ['websocket'],
      timeout: 8000,
      reconnection: false,
    });

    let finished = false;
    const finish = (reason, payload) => {
      if (finished) return;
      finished = true;
      logSocket('summary', { reason, sessionId, instanceId, payload: payload ?? null });
      try {
        socket.emit('voice:session:end', { sessionId });
      } catch {}
      setTimeout(() => {
        socket.disconnect();
        resolve({ reason, payload: payload ?? null });
      }, 600);
    };

    socket.on('connect', () => {
      logSocket('connect', { id: socket.id });
      socket.emit('voice:session:start', {
        sessionId,
        instanceId,
        lang: 'en',
        duplexMode: false,
      });
    });

    socket.on('connect_error', (error) => {
      logSocket('connect_error', { message: error.message });
      finish('connect_error', { message: error.message });
    });

    socket.on('voice:session:ready', (payload) => {
      logSocket('voice:session:ready', payload);
      socket.emit('voice:text', { sessionId, text: 'hello from platform bedrock smoke test' });
    });

    socket.on('voice:agent:text', (payload) => {
      logSocket('voice:agent:text', payload);
      finish('voice_agent_text', payload);
    });

    socket.on('voice:agent:end', (payload) => {
      logSocket('voice:agent:end', payload);
      finish('voice_agent_end', payload);
    });

    socket.on('voice:error', (payload) => {
      logSocket('voice:error', payload);
      finish('voice_error', payload);
    });

    socket.on('disconnect', (reason) => {
      logSocket('disconnect', { reason });
    });

    setTimeout(() => finish('timeout'), 30000);
  });
}

function printFilteredAppLogs() {
  const text = fs.existsSync(appLogPath) ? fs.readFileSync(appLogPath, 'utf8') : '';
  const lines = text.split(/\r?\n/).filter(Boolean);
  const pattern = /Voice client connected|Voice session started|voice:session|voice:error|voice:agent:text|voice:agent:end|Bedrock|ClaudeIntegrationService|Realtime agent response failed|cloud instance|ERROR|Error:|Exception|AccessDeniedException|ValidationException|ThrottlingException|Unauthorized|Forbidden|Insufficient Balance/i;
  const filtered = lines.filter((line) => pattern.test(line)).slice(-220);
  process.stdout.write('===APPKEY===\n');
  process.stdout.write(`${filtered.join('\n')}\n`);
}

async function main() {
  const envFile = parseEnvFile(path.join(backendDir, '.env'));
  const user = await findEligibleUser(envFile);
  logHttp(`RUN_ID=${runId}`);
  logHttp(`USER_JSON=${JSON.stringify(user)}`);

  const runtimeEnv = {
    ...process.env,
    ...envFile,
    NODE_ENV: 'production',
    HOST: '127.0.0.1',
    PORT: '3001',
    SESSION_SECRET: 'temp-session-bedrock-platform-smoke',
    JWT_SECRET: 'temp-jwt-bedrock-platform-smoke',
  };

  const token = signJwt(user.id, runtimeEnv.JWT_SECRET);
  logHttp(`TOKEN_SUB=${user.id}`);
  logHttp(`TOKEN_USER_EMAIL=${user.email || ''}`);

  const backendProcess = startBackend(runtimeEnv);

  try {
    await waitForServerReady('http://127.0.0.1:3001', backendProcess);

    const provisionResult = await fetchJson('http://127.0.0.1:3001/api/openclaw/cloud/provision', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Bedrock Voice Smoke',
        llmProvider: 'default',
      }),
    });
    fs.writeFileSync(provisionBodyPath, provisionResult.text || '');
    logHttp(`PROVISION_STATUS=${provisionResult.response.status}`);
    logHttp(provisionResult.text || '');

    const instanceId = provisionResult.json?.id || provisionResult.json?.instance?.id || provisionResult.json?.instanceId;
    if (!instanceId) {
      throw new Error('PROVISION_DID_NOT_RETURN_INSTANCE_ID');
    }

    await sleep(1000);
    const instanceResult = await fetchJson(`http://127.0.0.1:3001/api/openclaw/instances/${instanceId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    fs.writeFileSync(instanceBodyPath, instanceResult.text || '');
    logHttp(`INSTANCE_STATUS=${instanceResult.response.status}`);
    logHttp(instanceResult.text || '');

    const capabilities = instanceResult.json?.instance?.capabilities || instanceResult.json?.capabilities || {};
    logHttp(`CAPABILITIES_LLM_PROVIDER=${capabilities.llmProvider || ''}`);
    logHttp(`CAPABILITIES_ACTIVE_MODEL=${capabilities.activeModel || ''}`);

    const socketResult = await runSocketVoiceTest('http://127.0.0.1:3001', token, instanceId);
    logHttp(`SOCKET_RESULT=${JSON.stringify(socketResult)}`);
  } finally {
    await stopBackend(backendProcess);
  }

  process.stdout.write('===HTTP===\n');
  process.stdout.write(fs.readFileSync(httpLogPath, 'utf8'));
  process.stdout.write('===SOCKET===\n');
  process.stdout.write(fs.readFileSync(socketLogPath, 'utf8'));
  printFilteredAppLogs();
  process.stdout.write('===PATHS===\n');
  process.stdout.write(`APP_LOG=${appLogPath}\nHTTP_LOG=${httpLogPath}\nSOCKET_LOG=${socketLogPath}\nPROVISION_BODY=${provisionBodyPath}\nINST_BODY=${instanceBodyPath}\n`);
}

main().catch(async (error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.stderr.write(`APP_LOG=${appLogPath}\nHTTP_LOG=${httpLogPath}\nSOCKET_LOG=${socketLogPath}\n`);
  process.exitCode = 1;
});