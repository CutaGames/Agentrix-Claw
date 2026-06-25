/**
 * E2E Comprehensive Test: ALL Computer Use + Desktop Filesystem Tools
 *
 * Tests all 14 tools by:
 *   1. Registering a fake desktop device via heartbeat
 *   2. Sending a chat message that should trigger each tool
 *   3. Polling for the dispatched command
 *   4. Completing it with a mock result
 *   5. Verifying the model processes the result
 *
 * Usage:
 *   node scripts/test/e2e-all-computer-use.mjs
 */

const BASE = process.env.API_BASE || 'https://api.agentrix.top';
const DEVICE_PREFIX = `e2e-full-${Date.now()}`;
const TOKEN = process.env.TEST_TOKEN || '';

// Each tool test gets its own device ID to force a fresh conversation context
function makeDeviceId(index) {
  return `${DEVICE_PREFIX}-t${index}`;
}

// 1x1 red PNG
const RED_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';

// ═══════════════════════════════════════════════════════════════════════════
// Tool test definitions
// ═══════════════════════════════════════════════════════════════════════════

const TOOL_TESTS = [
  {
    name: 'computer_use_screenshot',
    kind: 'computer-use-screenshot',
    prompt: '截图给我看看桌面',
    mockResult: {
      width: 1920, height: 1080, monitor_index: 0,
      image_data_url: `data:image/png;base64,${RED_PNG_BASE64}`,
    },
    description: 'Take a screenshot',
  },
  {
    name: 'computer_use_click',
    kind: 'computer-use-click',
    prompt: '帮我点击屏幕坐标 (500, 300) 的位置',
    mockResult: { success: true, x: 500, y: 300, button: 'left' },
    description: 'Click at coordinates',
  },
  {
    name: 'computer_use_move',
    kind: 'computer-use-move',
    prompt: '把鼠标移动到屏幕坐标 (200, 400) 的位置，不要点击',
    mockResult: { success: true, x: 200, y: 400 },
    description: 'Move mouse pointer',
  },
  {
    name: 'computer_use_type',
    kind: 'computer-use-type',
    prompt: '在当前输入框中输入文字 "Hello World"',
    mockResult: { success: true, typed: 'Hello World' },
    description: 'Type text',
  },
  {
    name: 'computer_use_key',
    kind: 'computer-use-key',
    prompt: '按下键盘快捷键 Ctrl+C',
    mockResult: { success: true, combo: 'ctrl+c' },
    description: 'Send key combo',
  },
  {
    name: 'computer_use_window_tree',
    kind: 'computer-use-window-tree',
    prompt: '列出当前桌面上所有打开的窗口',
    mockResult: {
      windows: [
        { title: 'Visual Studio Code', app: 'Code.exe', bounds: { x: 0, y: 0, w: 1920, h: 1040 } },
        { title: 'Chrome - Google', app: 'chrome.exe', bounds: { x: 100, y: 50, w: 1200, h: 800 } },
      ],
    },
    description: 'List visible windows',
  },
  {
    name: 'computer_use_browser_navigate',
    kind: 'computer-use-browser-navigate',
    prompt: '打开 https://www.baidu.com',
    mockResult: { success: true, url: 'https://www.baidu.com', title: '百度一下，你就知道' },
    description: 'Open URL in browser',
  },
  {
    name: 'computer_use_browser_list_tabs',
    kind: 'computer-use-browser-list-tabs',
    prompt: '列出浏览器中当前打开的所有标签页',
    mockResult: {
      tabs: [
        { id: 'tab-1', title: '百度一下', url: 'https://www.baidu.com' },
        { id: 'tab-2', title: 'GitHub', url: 'https://github.com' },
      ],
    },
    description: 'List browser tabs',
  },
  {
    name: 'computer_use_browser_eval',
    kind: 'computer-use-browser-eval',
    prompt: '在浏览器中执行 JavaScript: document.title',
    mockResult: { result: '百度一下，你就知道' },
    description: 'Run JS in browser tab',
  },
  {
    name: 'computer_use_browser_click_selector',
    kind: 'computer-use-browser-click-selector',
    prompt: '在浏览器中点击 CSS 选择器 "#su" 对应的元素',
    mockResult: { success: true, selector: '#su', matched: true },
    description: 'Click element by CSS selector',
  },
  {
    name: 'desktop_read_file',
    kind: 'read-file',
    prompt: '读取桌面上的文件 C:\\Users\\test\\Desktop\\notes.txt',
    mockResult: { content: 'Hello from desktop file!\nLine 2\nLine 3' },
    description: 'Read a file',
  },
  {
    name: 'desktop_list_directory',
    kind: 'list-directory',
    prompt: '列出桌面上的文件',
    mockResult: {
      entries: [
        { name: 'notes.txt', type: 'file', size: 1024 },
        { name: 'photos', type: 'directory' },
        { name: 'report.pdf', type: 'file', size: 204800 },
      ],
    },
    description: 'List directory',
  },
  {
    name: 'desktop_write_file',
    kind: 'write-file',
    prompt: '在桌面创建一个文件 C:\\Users\\test\\Desktop\\test.txt，内容为 "E2E Test Content"',
    mockResult: { success: true, path: 'C:\\Users\\test\\Desktop\\test.txt', bytesWritten: 16 },
    description: 'Write a file',
  },
  {
    name: 'desktop_run_command',
    kind: 'run-command',
    prompt: '在桌面终端执行命令 echo hello',
    mockResult: { stdout: 'hello\n', stderr: '', exitCode: 0 },
    description: 'Run shell command',
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════

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
    throw new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 300)}`);
  }
  return res;
}

async function heartbeat(deviceId) {
  await api('POST', '/api/desktop-sync/heartbeat', {
    deviceId,
    platform: 'windows',
    appVersion: 'e2e-full-test-0.0.1',
  });
}

/**
 * Poll for a specific command kind, claim it, and complete it with mockResult.
 * Returns { found, commandId, kind, payload } or { found: false }
 */
async function pollForCommand(deviceId, expectedKind, mockResult, timeoutMs = 60000) {
  const start = Date.now();
  let pollCount = 0;
  while (Date.now() - start < timeoutMs) {
    await new Promise(r => setTimeout(r, 400));
    pollCount++;
    try {
      const res = await api('GET', `/api/desktop-sync/commands/pending?deviceId=${deviceId}`);
      const body = await res.json();
      const commands = body?.commands || body;
      if (!Array.isArray(commands) || commands.length === 0) continue;

      for (const cmd of commands) {
        // Claim and complete ALL commands we find
        try {
          await api('POST', `/api/desktop-sync/commands/${cmd.commandId}/claim`, { deviceId });
        } catch (e) { /* already claimed */ }

        if (cmd.kind === expectedKind) {
          // Complete with our mock result
          await api('POST', `/api/desktop-sync/commands/${cmd.commandId}/complete`, {
            status: 'completed',
            deviceId,
            result: mockResult,
          });
          return { found: true, commandId: cmd.commandId, kind: cmd.kind, payload: cmd.payload };
        } else {
          // Complete other commands with generic success
          await api('POST', `/api/desktop-sync/commands/${cmd.commandId}/complete`, {
            status: 'completed',
            deviceId,
            result: { success: true },
          });
        }
      }
    } catch (e) {
      // ignore poll errors
    }
  }
  return { found: false };
}

/**
 * Send a chat message and simultaneously poll for the expected command.
 * Each test uses its own deviceId for a fresh conversation context.
 * Returns { triggered, dispatched, commandPayload, modelResponse }
 */
async function testTool(toolTest, index) {
  const { name, kind, prompt, mockResult } = toolTest;
  const deviceId = makeDeviceId(index);

  // Register this device
  await heartbeat(deviceId);

  // Start polling BEFORE sending the chat (commands arrive async)
  const pollPromise = pollForCommand(deviceId, kind, mockResult, 90000);

  // Small delay to ensure poller is running
  await new Promise(r => setTimeout(r, 200));

  // Send chat
  let modelResponse = '';
  let streamError = '';
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000);

    const res = await fetch(`${BASE}/api/openclaw/proxy/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${TOKEN}`,
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({
        message: prompt,
        platform: 'desktop',
        deviceId,
        mode: 'agent',
        context: {
          enableComputerUse: true,
          enableBrowserAutomation: true,
          enableDesktopFilesystem: true,
        },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) {
      streamError = await res.text();
    } else {
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullText = '';
      while (true) {
        try {
          const { done, value } = await reader.read();
          if (done) break;
          fullText += decoder.decode(value, { stream: true });
        } catch { break; }
      }
      // Extract text from SSE
      for (const line of fullText.split('\n')) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.text) modelResponse += data.text;
            if (data.content) modelResponse += data.content;
            if (data.delta?.text) modelResponse += data.delta.text;
          } catch {
            const raw = line.slice(6);
            if (raw && raw !== '[DONE]') modelResponse += raw;
          }
        }
      }
    }
  } catch (e) {
    streamError = e.message;
  }

  const pollResult = await pollPromise;

  return {
    toolName: name,
    triggered: pollResult.found || modelResponse.length > 0,
    dispatched: pollResult.found,
    commandPayload: pollResult.payload || null,
    modelResponse: modelResponse.slice(0, 300),
    error: streamError ? streamError.slice(0, 200) : null,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Main
// ═══════════════════════════════════════════════════════════════════════════

async function main() {
  if (!TOKEN) {
    console.error('❌ TEST_TOKEN env var is required');
    process.exit(1);
  }

  console.log('🚀 E2E Comprehensive Computer Use Test');
  console.log(`   Base: ${BASE}`);
  console.log(`   Device prefix: ${DEVICE_PREFIX}`);
  console.log(`   Tools to test: ${TOOL_TESTS.length}`);
  console.log('');

  const results = [];

  for (let i = 0; i < TOOL_TESTS.length; i++) {
    const test = TOOL_TESTS[i];
    const deviceId = makeDeviceId(i);
    console.log(`\n[${ i + 1}/${TOOL_TESTS.length}] Testing: ${test.name} (${test.description})`);
    console.log(`   Prompt: "${test.prompt}"`);
    console.log(`   Device: ${deviceId}`);

    try {
      const result = await testTool(test, i);
      results.push(result);

      if (result.dispatched) {
        console.log(`   ✅ DISPATCHED — command kind "${test.kind}" received`);
        if (result.commandPayload) {
          console.log(`   📦 Payload: ${JSON.stringify(result.commandPayload).slice(0, 150)}`);
        }
      } else if (result.triggered) {
        console.log(`   ⚠️  Model responded but command NOT dispatched to device`);
      } else {
        console.log(`   ❌ FAILED — no command dispatched, no model response`);
      }

      if (result.error) {
        console.log(`   ⚠️  Error: ${result.error}`);
      }
      if (result.modelResponse) {
        console.log(`   💬 Model: "${result.modelResponse.slice(0, 120)}..."`);
      }
    } catch (e) {
      console.log(`   ❌ EXCEPTION: ${e.message}`);
      results.push({
        toolName: test.name,
        triggered: false,
        dispatched: false,
        commandPayload: null,
        modelResponse: '',
        error: e.message,
      });
    }

    // Brief pause between tests to avoid rate limiting
    await new Promise(r => setTimeout(r, 2000));
  }

  // Generate report
  console.log('\n\n═══════════════════════════════════════════════════════════════');
  console.log('📊 RESULTS SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const report = generateReport(results);
  console.log(report);

  // Write report file
  const reportPath = 'tests/reports/COMPUTER_USE_E2E_2026-05-18.md';
  const { writeFileSync, mkdirSync } = await import('fs');
  const { dirname } = await import('path');
  mkdirSync(dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, report, 'utf-8');
  console.log(`\n📄 Report written to: ${reportPath}`);

  // Exit code
  const passed = results.filter(r => r.dispatched).length;
  const total = results.length;
  console.log(`\n🏁 ${passed}/${total} tools dispatched successfully`);
  process.exit(passed === total ? 0 : 1);
}

function generateReport(results) {
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
  let md = `# Computer Use E2E Test Report\n\n`;
  md += `**Date:** ${now}\n`;
  md += `**API Base:** ${BASE}\n`;
  md += `**Device Prefix:** ${DEVICE_PREFIX}\n`;
  md += `**Total Tools Tested:** ${results.length}\n\n`;

  const passed = results.filter(r => r.dispatched).length;
  const triggered = results.filter(r => r.triggered).length;
  md += `## Summary\n\n`;
  md += `- ✅ **Dispatched (full round-trip):** ${passed}/${results.length}\n`;
  md += `- ⚠️  **Triggered (model responded):** ${triggered}/${results.length}\n`;
  md += `- ❌ **Failed:** ${results.length - triggered}/${results.length}\n\n`;

  md += `## Detailed Results\n\n`;
  md += `| # | Tool | Description | Triggered | Dispatched | Result |\n`;
  md += `|---|------|-------------|-----------|------------|--------|\n`;

  results.forEach((r, i) => {
    const test = TOOL_TESTS[i];
    const triggered = r.triggered ? '✅ Yes' : '❌ No';
    const dispatched = r.dispatched ? '✅ Yes' : '❌ No';
    let result = r.dispatched ? '✅ Full round-trip OK' : (r.error ? `❌ ${r.error.slice(0, 60)}` : '❌ Not dispatched');
    md += `| ${i + 1} | \`${r.toolName}\` | ${test.description} | ${triggered} | ${dispatched} | ${result} |\n`;
  });

  md += `\n## Command Payloads\n\n`;
  results.forEach((r, i) => {
    if (r.commandPayload) {
      md += `### ${i + 1}. \`${r.toolName}\`\n\n`;
      md += `\`\`\`json\n${JSON.stringify(r.commandPayload, null, 2)}\n\`\`\`\n\n`;
    }
  });

  md += `## Model Responses (excerpts)\n\n`;
  results.forEach((r, i) => {
    if (r.modelResponse) {
      md += `### ${i + 1}. \`${r.toolName}\`\n\n`;
      md += `> ${r.modelResponse.slice(0, 200).replace(/\n/g, ' ')}\n\n`;
    }
  });

  md += `## Errors\n\n`;
  const errors = results.filter(r => r.error);
  if (errors.length === 0) {
    md += `No errors encountered.\n`;
  } else {
    errors.forEach((r, i) => {
      md += `- \`${r.toolName}\`: ${r.error}\n`;
    });
  }

  return md;
}

main().catch(e => {
  console.error('💥 Unhandled error:', e);
  process.exit(1);
});
