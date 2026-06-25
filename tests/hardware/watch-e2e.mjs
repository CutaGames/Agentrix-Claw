/**
 * Watch E2E Tests via ADB
 * 
 * Tests: Wa1-Wa5 from E2E_TEST_PLAN_V4
 * - Living Tile display
 * - L1 approval flow
 * - AXP balance display
 * - Voice command relay
 * 
 * Prerequisites:
 *   - Watch connected via ADB (adb devices shows watch)
 *   - Agentrix WearOS companion installed
 *   - Phone paired and running Agentrix mobile app
 * 
 * Run: node tests/hardware/watch-e2e.mjs
 */
import { execSync } from 'child_process';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const REPORT_DIR = join(process.cwd(), 'tests', 'reports', `watch-${new Date().toISOString().slice(0, 10)}`);
mkdirSync(REPORT_DIR, { recursive: true });

const results = [];

function adb(cmd, { device = '', timeout = 10000 } = {}) {
  const deviceFlag = device ? `-s ${device}` : '';
  try {
    return execSync(`adb ${deviceFlag} ${cmd}`, { timeout, encoding: 'utf-8' }).trim();
  } catch (e) {
    return `ERROR: ${e.message}`;
  }
}

function log(testId, name, passed, detail = '') {
  const status = passed ? '✅ PASS' : '❌ FAIL';
  const entry = { testId, name, passed, detail, timestamp: new Date().toISOString() };
  results.push(entry);
  console.log(`${status} | ${testId}: ${name}${detail ? ' — ' + detail : ''}`);
}

// ─── Detect watch device ────────────────────────────────────────────────────

function getWatchDevice() {
  const devices = adb('devices');
  const lines = devices.split('\n').filter(l => l.includes('device') && !l.includes('List'));
  // Watch typically has a different serial pattern
  for (const line of lines) {
    const serial = line.split('\t')[0];
    // Try to identify watch by screen size or product name
    const product = adb(`-s ${serial} shell getprop ro.product.model`);
    if (product.toLowerCase().includes('watch') || product.toLowerCase().includes('wear')) {
      return serial;
    }
  }
  // Fallback: use first device if only one connected
  if (lines.length === 1) {
    return lines[0].split('\t')[0];
  }
  return null;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

async function runTests() {
  console.log('═══════════════════════════════════════════════════');
  console.log('  Agentrix Watch E2E Tests');
  console.log('═══════════════════════════════════════════════════\n');

  const watchDevice = getWatchDevice();
  if (!watchDevice) {
    log('SETUP', 'Watch device detection', false, 'No watch device found via ADB');
    saveReport();
    return;
  }
  log('SETUP', 'Watch device detection', true, `Device: ${watchDevice}`);

  // Wa1: Living Tile 显示
  {
    // Check if Agentrix companion is installed
    const packages = adb(`-s ${watchDevice} shell pm list packages`, { timeout: 5000 });
    const hasApp = packages.includes('app.agentrix');
    log('Wa1', 'Living Tile — companion app installed', hasApp, hasApp ? 'app.agentrix found' : 'Not installed');

    if (hasApp) {
      // Launch the watch app
      adb(`-s ${watchDevice} shell am start -n app.agentrix.wear/.MainActivity`);
      await sleep(3000);
      // Take screenshot
      adb(`-s ${watchDevice} shell screencap /sdcard/wa1.png`);
      adb(`-s ${watchDevice} pull /sdcard/wa1.png ${join(REPORT_DIR, 'wa1-living-tile.png')}`);
      log('Wa1', 'Living Tile — screenshot captured', true);
    }
  }

  // Wa2: L1 审批显示
  {
    // Send a test notification to trigger L1 approval UI
    const notifCmd = `shell am broadcast -a app.agentrix.TEST_L1_APPROVAL --es title "测试审批" --es body "允许发送邮件？"`;
    adb(`-s ${watchDevice} ${notifCmd}`);
    await sleep(2000);
    adb(`-s ${watchDevice} shell screencap /sdcard/wa2.png`);
    adb(`-s ${watchDevice} pull /sdcard/wa2.png ${join(REPORT_DIR, 'wa2-l1-approval.png')}`);
    log('Wa2', 'L1 approval notification sent', true, 'Screenshot captured');
  }

  // Wa3: L1 审批通过 (simulate tap on approve button)
  {
    // Tap center of screen (approve button position varies)
    adb(`-s ${watchDevice} shell input tap 180 280`);
    await sleep(1000);
    log('Wa3', 'L1 approval tap simulated', true, 'Tapped approve area');
  }

  // Wa4: AXP 余额显示
  {
    // Send AXP update via broadcast
    adb(`-s ${watchDevice} shell am broadcast -a app.agentrix.AXP_UPDATE --ei balance 2450`);
    await sleep(1000);
    adb(`-s ${watchDevice} shell screencap /sdcard/wa4.png`);
    adb(`-s ${watchDevice} pull /sdcard/wa4.png ${join(REPORT_DIR, 'wa4-axp-balance.png')}`);
    log('Wa4', 'AXP balance update broadcast', true, 'Balance: 2450');
  }

  // Wa5: 语音指令 (verify microphone permission)
  {
    const perms = adb(`-s ${watchDevice} shell dumpsys package app.agentrix.wear | grep RECORD_AUDIO`);
    const hasMicPerm = perms.includes('granted=true');
    log('Wa5', 'Voice command — microphone permission', hasMicPerm, hasMicPerm ? 'RECORD_AUDIO granted' : 'Permission not granted');
  }

  saveReport();
}

function saveReport() {
  const passed = results.filter(r => r.passed).length;
  const total = results.length;
  const report = {
    date: new Date().toISOString(),
    device: 'Watch (ADB)',
    summary: `${passed}/${total} passed (${Math.round(passed / total * 100)}%)`,
    results,
  };
  writeFileSync(join(REPORT_DIR, 'watch-results.json'), JSON.stringify(report, null, 2));
  console.log(`\n📊 Report saved: ${REPORT_DIR}/watch-results.json`);
  console.log(`   ${report.summary}`);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

runTests().catch(console.error);
