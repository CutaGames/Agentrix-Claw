const { io } = require('socket.io-client');

const baseUrl = process.env.VOICE_SMOKE_BASE_URL || 'http://127.0.0.1:3902';
const token = process.env.VOICE_SMOKE_TOKEN;
const instanceId = process.env.VOICE_SMOKE_INSTANCE_ID;
const timeoutMs = Number(process.env.VOICE_SMOKE_TIMEOUT_MS || 30000);

if (!token) {
  throw new Error('VOICE_SMOKE_TOKEN is required');
}

if (!instanceId) {
  throw new Error('VOICE_SMOKE_INSTANCE_ID is required');
}

async function main() {
  const sessionId = `socket-smoke-${Date.now()}`;
  const result = await new Promise((resolve) => {
    const events = [];
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
      console.log('EVENT=connect');
      socket.emit('voice:session:start', {
        sessionId,
        instanceId,
        lang: 'en',
        duplexMode: false,
      });
    });

    socket.on('connect_error', (error) => {
      events.push({ event: 'connect_error', payload: { message: error.message } });
      console.log(`EVENT=connect_error ${error.message}`);
      finish('connect_error', { message: error.message });
    });

    socket.on('voice:session:ready', (payload) => {
      events.push({ event: 'voice:session:ready', payload });
      console.log(`EVENT=voice:session:ready ${JSON.stringify(payload)}`);
      socket.emit('voice:text', { sessionId, text: 'hello from socket smoke test' });
    });

    socket.on('voice:meta', (payload) => {
      events.push({ event: 'voice:meta', payload });
      console.log(`EVENT=voice:meta ${JSON.stringify(payload)}`);
    });

    socket.on('voice:agent:text', (payload) => {
      events.push({ event: 'voice:agent:text', payload });
      console.log(`EVENT=voice:agent:text ${JSON.stringify(payload)}`);
      finish('voice:agent:text', payload);
    });

    socket.on('voice:agent:end', (payload) => {
      events.push({ event: 'voice:agent:end', payload });
      console.log(`EVENT=voice:agent:end ${JSON.stringify(payload)}`);
      finish('voice:agent:end', payload);
    });

    socket.on('voice:error', (payload) => {
      events.push({ event: 'voice:error', payload });
      console.log(`EVENT=voice:error ${JSON.stringify(payload)}`);
      finish('voice:error', payload);
    });

    setTimeout(() => finish('timeout'), timeoutMs);
  });

  console.log(`RESULT=${JSON.stringify(result)}`);
  if (!['voice:agent:text', 'voice:agent:end'].includes(result.reason)) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});