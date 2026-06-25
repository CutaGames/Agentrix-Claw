/**
 * E2E test: Cloud Computer-Use Screenshot
 *
 * This script acts as BOTH a fake desktop client AND a chat user to verify
 * the full round-trip:
 *   1. Authenticate (get JWT from production)
 *   2. Register a fake desktop device via heartbeat
 *   3. Send "截图给我看看桌面" to the stream endpoint
 *   4. Poll for pending commands; when computer-use-screenshot arrives,
 *      complete it with a known 1x1 red PNG
 *   5. Read the SSE stream and check the model's response
 *
 * Usage:
 *   node scripts/test/e2e-cloud-screenshot.mjs
 *
 * Requires: NODE_ENV with access to production (47.130.176.148)
 */

const BASE = process.env.API_BASE || 'https://api.agentrix.top';
const PROD_IP = '47.130.176.148';
const DEVICE_ID = `e2e-test-device-${Date.now()}`;

// 1x1 red PNG (valid, tiny)
const RED_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';

let TOKEN = process.env.TEST_TOKEN || '';

async function getToken() {
  if (TOKEN) return TOKEN;
  // Try to get token from server via SSH script output
  console.log('⚠️  No TEST_TOKEN env var. Attempting to fetch from server...');
  const { execSync } = await import('child_process');
  try {
    const out = execSync(
      `ssh -o StrictHostKeyChecking=no -i C:\\Users\\15279\\Desktop\\hq.pem ubuntu@${PROD_IP} "cd /home/ubuntu/Agentrix/backend && set -a && . .env && set +a && node -e \\"const jwt=require('jsonwebtoken');const t=jwt.sign({sub:'e2e-test',id:'e2e-test',email:'e2e@test.local'},process.env.JWT_SECRET,{expiresIn:'1h'});console.log(t)\\""`,
      { encoding: 'utf-8', timeout: 30000 },
    ).trim();
    TOKEN = out.split('\n').pop().trim();
    console.log(`✅ Got token: ${TOKEN.slice(0, 20)}...`);
    return TOKEN;
  } catch (e) {
    console.error('❌ Failed to get token:', e.message);
    process.exit(1);
  }
}

async function api(method, path, body) {
  const url = `${BASE}${path}`;
  const opts = {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${TOKEN}`,
    },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  if (!res.ok && !path.includes('/stream')) {
    const text = await res.text();
    throw new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 200)}`);
  }
  return res;
}

async function heartbeat() {
  console.log('💓 Sending heartbeat...');
  await api('POST', '/api/desktop-sync/heartbeat', {
    deviceId: DEVICE_ID,
    platform: 'windows',
    appVersion: 'e2e-test-0.0.1',
  });
  console.log('✅ Heartbeat registered');
}

async function pollAndComplete(timeoutMs = 90000) {
  const start = Date.now();
  let pollCount = 0;
  console.log(`🔄 Polling for pending commands (timeout ${timeoutMs / 1000}s)...`);
  while (Date.now() - start < timeoutMs) {
    await new Promise(r => setTimeout(r, 500));
    pollCount++;
    try {
      const res = await api('GET', `/api/desktop-sync/commands/pending?deviceId=${DEVICE_ID}`);
      const body = await res.json();
      const commands = body?.commands || body;
      if (pollCount <= 5 || pollCount % 20 === 0) {
        console.log(`  [poll #${pollCount}] got ${Array.isArray(commands) ? commands.length : 'non-array'} commands`);
      }
      if (!Array.isArray(commands) || commands.length === 0) continue;

      for (const cmd of commands) {
        console.log(`📥 Got command: ${cmd.kind} (${cmd.commandId})`);
        if (cmd.kind === 'computer-use-screenshot') {
          // Claim it
          await api('POST', `/api/desktop-sync/commands/${cmd.commandId}/claim`, {
            deviceId: DEVICE_ID,
          });
          console.log('  ✅ Claimed');

          // Complete with our known red PNG
          const result = {
            width: 1,
            height: 1,
            monitor_index: 0,
            image_data_url: `data:image/png;base64,${RED_PNG_BASE64}`,
          };
          await api('POST', `/api/desktop-sync/commands/${cmd.commandId}/complete`, {
            status: 'completed',
            deviceId: DEVICE_ID,
            result,
          });
          console.log('  ✅ Completed with 1x1 red PNG');
          return true;
        } else {
          // Complete other commands with success
          await api('POST', `/api/desktop-sync/commands/${cmd.commandId}/claim`, {
            deviceId: DEVICE_ID,
          });
          await api('POST', `/api/desktop-sync/commands/${cmd.commandId}/complete`, {
            status: 'completed',
            deviceId: DEVICE_ID,
            result: { success: true },
          });
          console.log(`  ✅ Completed ${cmd.kind} with success`);
        }
      }
    } catch (e) {
      // ignore poll errors
    }
  }
  console.log('⏰ Poll timeout — no screenshot command received');
  return false;
}

async function streamChat() {
  console.log('💬 Sending chat: "截图给我看看桌面"...');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 180000);
  
  try {
    const res = await fetch(`${BASE}/api/openclaw/proxy/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${TOKEN}`,
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({
        message: '截图给我看看桌面',
        platform: 'desktop',
        deviceId: DEVICE_ID,
        mode: 'agent',
        context: {
          enableComputerUse: true,
          enableBrowserAutomation: true,
        },
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errText = await res.text();
      console.log(`❌ Stream request failed: ${res.status} ${errText.slice(0, 300)}`);
      return errText;
    }

    // Read SSE stream
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let fullText = '';
    let chunks = 0;
    const startTime = Date.now();

    while (true) {
      try {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        fullText += chunk;
        chunks++;
        if (chunks % 20 === 0) process.stdout.write('.');
      } catch (readErr) {
        console.log(`\n⚠️  Stream read error: ${readErr.message}`);
        break;
      }
    }
    console.log(`\n📨 Stream complete (${chunks} chunks, ${fullText.length} chars)`);
    console.log('📄 Raw SSE (first 800):', fullText.slice(0, 800));
    return fullText;
  } catch (err) {
    console.log(`❌ Stream fetch error: ${err.message}`);
    return '';
  } finally {
    clearTimeout(timeout);
  }
}

function analyzeResponse(sseText) {
  // Extract text content from SSE data lines
  const lines = sseText.split('\n');
  let assistantText = '';
  for (const line of lines) {
    if (line.startsWith('data: ')) {
      try {
        const data = JSON.parse(line.slice(6));
        if (data.text) assistantText += data.text;
        if (data.content) assistantText += data.content;
        if (data.delta?.text) assistantText += data.delta.text;
      } catch {
        // raw text chunk
        const raw = line.slice(6);
        if (raw && raw !== '[DONE]') assistantText += raw;
      }
    }
  }

  console.log('\n═══════════════════════════════════════');
  console.log('📋 Model response (first 500 chars):');
  console.log(assistantText.slice(0, 500));
  console.log('═══════════════════════════════════════');

  // Check for hallucination markers
  const hallucinations = [
    'Google', 'Chrome', '手气不错', 'google.com', '搜索框',
    '浏览器', 'Firefox', 'Edge', '百度',
  ];
  const found = hallucinations.filter(h => assistantText.includes(h));

  // Check for failure acknowledgment
  const failureMarkers = ['失败', 'FAILURE', '未响应', '超时', 'failed', '无法'];
  const hasFailure = failureMarkers.some(m => assistantText.includes(m));

  // Check for correct description (1x1 red pixel)
  const correctMarkers = ['1x1', '红', 'red', '像素', 'pixel', '纯色', 'solid'];
  const hasCorrect = correctMarkers.some(m => assistantText.toLowerCase().includes(m));

  console.log('\n🔍 Analysis:');
  if (found.length > 0) {
    console.log(`  ❌ HALLUCINATION DETECTED: model mentioned ${found.join(', ')}`);
    return 'HALLUCINATION';
  }
  if (hasCorrect) {
    console.log('  ✅ Model correctly described the image content');
    return 'CORRECT';
  }
  if (hasFailure) {
    console.log('  ⚠️  Model reported failure (image may not have reached it)');
    return 'FAILURE_REPORTED';
  }
  console.log('  ℹ️  Model responded but unclear if correct');
  console.log('  Full text for manual review:', assistantText.slice(0, 1000));
  return 'UNCLEAR';
}

// ═══════════════════════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════════════════════

async function main() {
  console.log('🚀 E2E Cloud Computer-Use Screenshot Test');
  console.log(`   Base: ${BASE}`);
  console.log(`   Device: ${DEVICE_ID}`);
  console.log('');

  await getToken();
  await heartbeat();

  // Run poll + chat in parallel
  const [pollResult, sseText] = await Promise.all([
    pollAndComplete(120000),
    streamChat(),
  ]);

  if (!pollResult) {
    console.log('\n❌ TEST FAILED: No screenshot command was dispatched to our device.');
    console.log('   Possible causes:');
    console.log('   - enableComputerUse not reaching backend');
    console.log('   - Model did not call computer_use_screenshot tool');
    console.log('   - Command was dispatched to a different device');
    process.exit(1);
  }

  const verdict = analyzeResponse(sseText);
  console.log(`\n🏁 VERDICT: ${verdict}`);

  if (verdict === 'HALLUCINATION') {
    console.log('❌ TEST FAILED — model is still hallucinating');
    process.exit(1);
  } else if (verdict === 'CORRECT') {
    console.log('✅ TEST PASSED — model correctly described the screenshot');
    process.exit(0);
  } else if (verdict === 'FAILURE_REPORTED') {
    console.log('⚠️  PARTIAL — model reported failure instead of hallucinating (improvement!)');
    console.log('   The image may not have been delivered. Check PM2 logs.');
    process.exit(2);
  } else {
    console.log('⚠️  INCONCLUSIVE — manual review needed');
    process.exit(2);
  }
}

main().catch(e => {
  console.error('💥 Unhandled error:', e);
  process.exit(1);
});
