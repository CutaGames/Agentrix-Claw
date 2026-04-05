/**
 * Agentrix Desktop – Comprehensive IPC smoke test via CDP
 * Covers desktop bridge commands, workspace flows, and plugin commands.
 */
const WS = require('ws');
const http = require('http');
const path = require('path');

const results = [];
let ws;
let nextId = 0;
const pending = new Map();

function send(method, params) {
  const id = ++nextId;
  ws.send(JSON.stringify({ id, method, params }));
  return id;
}

function invokeCmd(label, cmd, args, expectOk) {
  return new Promise((resolve) => {
    const expr = `new Promise(function(resolve) {
      var t = setTimeout(function() { resolve("TIMEOUT_15s"); }, 15000);
      window.__TAURI_INTERNALS__.invoke("${cmd}", ${JSON.stringify(args)}).then(
        function(v) { clearTimeout(t); resolve("OK:" + JSON.stringify(v)); },
        function(e) { clearTimeout(t); resolve("ERR:" + String(e)); }
      );
    })`;
    const id = send('Runtime.evaluate', {
      expression: expr,
      awaitPromise: true,
      returnByValue: true,
    });
    pending.set(id, { label, expectOk, resolve });
  });
}

function evalExpr(label, expr) {
  return new Promise((resolve) => {
    const id = send('Runtime.evaluate', {
      expression: expr,
      awaitPromise: true,
      returnByValue: true,
    });
    pending.set(id, { label, expectOk: true, resolve });
  });
}

http.get('http://127.0.0.1:9222/json/list', (r) => {
  let d = '';
  r.on('data', (c) => (d += c));
  r.on('end', async () => {
    const targets = JSON.parse(d);
    const t = targets.find((x) => x.url.includes('tauri.localhost')) || targets[0];
    console.log('TARGET:', t.url);

    ws = new WS(t.webSocketDebuggerUrl);
    ws.on('open', async () => {
      send('Runtime.enable');
      // Wait for Runtime.enable to take effect
      await new Promise((r) => setTimeout(r, 1000));

      console.log('\n=== Agentrix Desktop Smoke Test ===\n');

      // ---- Group 1: Auth token lifecycle ----
      console.log('--- Auth Token Lifecycle ---');
      await invokeCmd('set_auth_token', 'desktop_bridge_set_auth_token', { token: 'smoke_test_token_12345' }, true);
      await invokeCmd('get_auth_token', 'desktop_bridge_get_auth_token', {}, true);
      await invokeCmd('delete_auth_token', 'desktop_bridge_delete_auth_token', {}, true);
      await invokeCmd('get_auth_token_after_delete', 'desktop_bridge_get_auth_token', {}, true);

      // ---- Group 2: Clipboard ----
      console.log('--- Clipboard ---');
      await invokeCmd('get_clipboard_text', 'desktop_bridge_get_clipboard_text', {}, true);

      // ---- Group 3: Ball position ----
      console.log('--- Ball Position ---');
      await invokeCmd('set_ball_position', 'desktop_bridge_set_ball_position', { x: 100.0, y: 200.0 }, true);
      await invokeCmd('get_ball_position', 'desktop_bridge_get_ball_position', {}, true);

      // ---- Group 4: Desktop context & windows ----
      console.log('--- Desktop Context & Windows ---');
      await invokeCmd('get_context', 'desktop_bridge_get_context', {}, true);
      await invokeCmd('get_active_window', 'desktop_bridge_get_active_window', {}, true);
      await invokeCmd('list_windows', 'desktop_bridge_list_windows', {}, true);

      // ---- Group 5: Debug logging ----
      console.log('--- Debug Logging ---');
      await invokeCmd('log_debug_event', 'desktop_bridge_log_debug_event', { message: 'smoke_test_event' }, true);

      // ---- Group 6: File I/O ----
      console.log('--- File I/O ---');
      const testFile = process.env.TEMP ? process.env.TEMP.replace(/\\/g, '/') + '/agentrix_smoke_test.txt' : '/tmp/agentrix_smoke_test.txt';
      const repoRoot = path.resolve(process.cwd(), '..').replace(/\\/g, '/');
      const servicesDir = `${repoRoot}/desktop/src/services`;
      const workspaceFile = `${repoRoot}/desktop/src/services/workspace.ts`;
      const workspaceSmokeRelativePath = 'desktop/tmp_workspace_smoke.txt';
      await invokeCmd('write_file', 'desktop_bridge_write_file', { path: testFile, content: 'Hello from smoke test!' }, true);
      await invokeCmd('read_file', 'desktop_bridge_read_file', { path: testFile }, true);

      // ---- Group 7: Workspace / directory / ranged read ----
      console.log('--- Workspace / Directory / Range ---');
      await invokeCmd('set_workspace_dir', 'desktop_bridge_set_workspace_dir', { path: repoRoot }, true);
      await invokeCmd('list_directory', 'desktop_bridge_list_directory', { path: servicesDir }, true);
      await evalExpr('read_file_range', `new Promise(function(resolve) {
        window.__TAURI_INTERNALS__.invoke("desktop_bridge_read_file", {
          path: ${JSON.stringify(workspaceFile)},
          startLine: 1,
          endLine: 3,
        }).then(
          function(v) {
            var ok = v && v.startLine === 1 && v.endLine === 3 && typeof v.content === "string" && v.content.indexOf('import { invoke }') === 0;
            resolve((ok ? "OK:" : "ERR:") + JSON.stringify(v));
          },
          function(e) { resolve("ERR:" + String(e)); }
        );
      })`);
      await invokeCmd('list_workspace_dir', 'desktop_bridge_list_workspace_dir', { relativePath: 'desktop/src/services' }, true);
      await invokeCmd('write_workspace_file', 'desktop_bridge_write_workspace_file', { relativePath: workspaceSmokeRelativePath, content: 'workspace smoke ok' }, true);
      await evalExpr('read_workspace_file', `new Promise(function(resolve) {
        window.__TAURI_INTERNALS__.invoke("desktop_bridge_read_workspace_file", {
          relativePath: ${JSON.stringify(workspaceSmokeRelativePath)},
        }).then(
          function(v) { resolve((v === "workspace smoke ok" ? "OK:" : "ERR:") + String(v)); },
          function(e) { resolve("ERR:" + String(e)); }
        );
      })`);

      // ---- Group 8: Shell command ----
      console.log('--- Shell Command ---');
      await invokeCmd('run_command', 'desktop_bridge_run_command', { command: 'echo hello_from_agentrix', workingDirectory: null, timeoutMs: 5000 }, true);

      // ---- Group 9: Browser open (skip actual open to avoid side effects) ----
      // We test that the command is registered but use a benign URL
      // Skipping to avoid opening a browser tab during test

      // ---- Group 10: Panel operations ----
      console.log('--- Panel Operations ---');
      await invokeCmd('open_chat_panel', 'desktop_bridge_open_chat_panel', {}, true);
      await new Promise((r) => setTimeout(r, 1500));
      await invokeCmd('close_chat_panel', 'desktop_bridge_close_chat_panel', {}, true);

      // ---- Group 11: Panel position ----
      console.log('--- Panel Position ---');
      await invokeCmd('set_panel_position', 'desktop_bridge_set_panel_position_near_ball', {}, true);

      // ---- Group 12: Plugin commands ----
      console.log('--- Plugin Commands ---');
      await invokeCmd('app_version', 'plugin:app|version', {}, true);
      await invokeCmd('app_name', 'plugin:app|name', {}, true);
      await invokeCmd('app_tauri_version', 'plugin:app|tauri_version', {}, true);

      // ---- Group 13: Pair session (will fail without server but should not hang) ----
      console.log('--- Pair Session (expect network error) ---');
      await invokeCmd('create_pair_session', 'desktop_bridge_create_pair_session', { sessionId: 'smoke-test-session' }, false);

      // ---- Group 14: Password login (will fail without server but should not hang) ----
      console.log('--- Password Login (expect network error) ---');
      await invokeCmd('password_login', 'desktop_bridge_password_login', { email: 'test@example.com', password: 'not_real' }, false);

      // ---- Print Summary ----
      console.log('\n=== SMOKE TEST SUMMARY ===\n');
      let pass = 0, fail = 0, total = results.length;
      for (const r of results) {
        const status = r.passed ? 'PASS' : 'FAIL';
        if (r.passed) pass++; else fail++;
        console.log(`  [${status}] ${r.label}: ${r.value.substring(0, 120)}`);
      }
      console.log(`\nTotal: ${total}  Pass: ${pass}  Fail: ${fail}`);
      console.log(fail === 0 ? '\n✅ ALL TESTS PASSED' : '\n❌ SOME TESTS FAILED');

      ws.close();
      process.exit(fail === 0 ? 0 : 1);
    });

    ws.on('message', (m) => {
      const msg = JSON.parse(String(m));
      if (msg.id && pending.has(msg.id)) {
        const { label, expectOk, resolve } = pending.get(msg.id);
        pending.delete(msg.id);
        const val = msg.result?.result?.value;
        const err = msg.result?.exceptionDetails?.exception?.description;
        const value = val !== undefined ? String(val) : 'EVAL_ERR:' + err;

        // Determine pass/fail
        let passed;
        if (value.startsWith('TIMEOUT_')) {
          passed = false;
        } else if (expectOk) {
          passed = value.startsWith('OK:');
        } else {
          // For "expect error" tests, both OK and ERR are acceptable (not TIMEOUT)
          passed = value.startsWith('OK:') || value.startsWith('ERR:');
        }

        results.push({ label, value, passed });
        console.log(`  [${passed ? 'PASS' : 'FAIL'}] ${label}: ${value.substring(0, 120)}`);
        resolve({ label, value, passed });
      }
    });

    // Safety timeout
    setTimeout(() => {
      console.log('\n⚠️  GLOBAL TIMEOUT — some commands did not respond');
      for (const [id, { label }] of pending) {
        results.push({ label, value: 'GLOBAL_TIMEOUT', passed: false });
        console.log(`  [FAIL] ${label}: GLOBAL_TIMEOUT`);
      }
      process.exit(1);
    }, 120000);
  });
});
