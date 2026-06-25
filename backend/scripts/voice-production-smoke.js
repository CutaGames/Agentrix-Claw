const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function requireFromWorkspace(moduleName) {
  try {
    return require(moduleName);
  } catch {
    return require(path.join(__dirname, '..', '..', 'node_modules', moduleName));
  }
}

const { Client } = requireFromWorkspace('pg');

const backendDir = path.resolve(__dirname, '..');
const baseUrl = process.env.VOICE_SMOKE_BASE_URL || 'http://127.0.0.1:3000';

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
    json = null;
  }
  return { response, text, json };
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
    let result;

    try {
      result = await client.query(`
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
    } catch (error) {
      if (!/column o\.userId does not exist/i.test(error.message || '')) {
        throw error;
      }

      result = await client.query(`
        select u.id, u.email
        from users u
        where not exists (
          select 1
          from openclaw_instances o
          where o.user_id = u.id
            and o.instance_type = 'cloud'
            and o.status in ('active', 'provisioning')
        )
        order by u.id asc
        limit 1
      `);
    }

    if (!result.rows.length) {
      throw new Error('NO_ELIGIBLE_USER');
    }

    return result.rows[0];
  } finally {
    await client.end();
  }
}

async function runSocketVoiceTest(token, instanceId) {
  const { io } = requireFromWorkspace('socket.io-client');
  return await new Promise((resolve) => {
    const sessionId = `prod-smoke-${Date.now()}`;
    const socket = io(`${baseUrl}/voice`, {
      auth: { token },
      transports: ['websocket'],
      timeout: 8000,
      reconnection: false,
    });

    const events = [];
    let finished = false;

    const finish = (reason, payload) => {
      if (finished) return;
      finished = true;
      try {
        socket.emit('voice:session:end', { sessionId });
      } catch {}
      setTimeout(() => {
        socket.disconnect();
        resolve({ reason, payload: payload ?? null, events });
      }, 500);
    };

    socket.on('connect', () => {
      events.push({ event: 'connect', payload: { id: socket.id } });
      socket.emit('voice:session:start', {
        sessionId,
        instanceId,
        lang: 'en',
        duplexMode: false,
      });
    });

    socket.on('connect_error', (error) => {
      events.push({ event: 'connect_error', payload: { message: error.message } });
      finish('connect_error', { message: error.message });
    });

    socket.on('voice:session:ready', (payload) => {
      events.push({ event: 'voice:session:ready', payload });
      socket.emit('voice:text', { sessionId, text: 'hello from production voice smoke test' });
    });

    socket.on('voice:meta', (payload) => {
      events.push({ event: 'voice:meta', payload });
    });

    socket.on('voice:agent:text', (payload) => {
      events.push({ event: 'voice:agent:text', payload });
      finish('voice:agent:text', payload);
    });

    socket.on('voice:agent:end', (payload) => {
      events.push({ event: 'voice:agent:end', payload });
      finish('voice:agent:end', payload);
    });

    socket.on('voice:error', (payload) => {
      events.push({ event: 'voice:error', payload });
      finish('voice:error', payload);
    });

    setTimeout(() => finish('timeout'), 30000);
  });
}

async function main() {
  const envFile = parseEnvFile(path.join(backendDir, '.env'));
  const user = await findEligibleUser(envFile);
  const token = signJwt(user.id, process.env.JWT_SECRET || envFile.JWT_SECRET);
  const skipSocket = String(process.env.VOICE_SMOKE_SKIP_SOCKET || '').toLowerCase() === 'true';

  console.log(`BASE_URL=${baseUrl}`);
  console.log(`USER_JSON=${JSON.stringify(user)}`);

  const provisionResult = await fetchJson(`${baseUrl}/api/openclaw/cloud/provision`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: 'Production Voice Smoke',
      llmProvider: 'default',
    }),
  });

  console.log(`PROVISION_STATUS=${provisionResult.response.status}`);
  console.log(provisionResult.text || '');

  const instanceId = provisionResult.json?.id || provisionResult.json?.instance?.id || provisionResult.json?.instanceId;
  if (!instanceId) {
    throw new Error('PROVISION_DID_NOT_RETURN_INSTANCE_ID');
  }

  const instanceResult = await fetchJson(`${baseUrl}/api/openclaw/instances/${instanceId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  console.log(`INSTANCE_STATUS=${instanceResult.response.status}`);
  console.log(instanceResult.text || '');

  const chatResult = await fetchJson(`${baseUrl}/api/openclaw/proxy/${instanceId}/chat`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: 'hello from production chat smoke',
      sessionId: `prod-chat-smoke-${Date.now()}`,
    }),
    signal: AbortSignal.timeout(60000),
  });
  console.log(`CHAT_STATUS=${chatResult.response.status}`);
  console.log(chatResult.text || '');

  console.log(`TOKEN=${token}`);
  console.log(`INSTANCE_ID=${instanceId}`);

  if (skipSocket) {
    console.log('SOCKET_SKIPPED=true');
    return;
  }

  const socketResult = await runSocketVoiceTest(token, instanceId);
  console.log(`SOCKET_RESULT=${JSON.stringify(socketResult)}`);
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});