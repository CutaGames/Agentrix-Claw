/**
 * Claw build 535 (REQ-mobile-080.re-release, 2026-09-30 16:59): the app was killed with
 * ForegroundServiceDidNotStartInTimeException from AndroidBackgroundWakeWordService.
 *
 * Every Context.startForegroundService() must be answered by Service.startForeground() in the
 * onStartCommand of that start. The service used to stop itself from onCreate / startForegroundCompat
 * with a bare stopSelf(), which also dropped starts that were still queued; and syncConfig started the
 * service (REFRESH) every time the app came to the front, right before the STOP.
 *
 * Kotlin does not compile in this repo's jest run, so these checks read the checked-in sources
 * (CI runs `expo prebuild` without --clean, so these files are what ships).
 */
import { describe, it, expect } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

const dir = path.resolve(__dirname, '..', '..', '..', 'android/app/src/main/java/app/agentrix/claw');

/** Source without comments, so the explanations in the file do not count as calls. */
function code(file: string): string {
  return fs
    .readFileSync(path.join(dir, file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\r\n]*/g, '');
}

/** Body of `fun <name>(…) { … }` (brace-matched; the functions checked here have no braces in strings). */
function body(src: string, name: string): string {
  const at = src.search(new RegExp(`fun ${name}\\(`));
  if (at < 0) throw new Error(`fun ${name} not found`);
  const open = src.indexOf('{', src.indexOf(')', at));
  let depth = 0;
  for (let i = open; i < src.length; i += 1) {
    if (src[i] === '{') depth += 1;
    if (src[i] === '}') {
      depth -= 1;
      if (depth === 0) return src.slice(open + 1, i);
    }
  }
  throw new Error(`fun ${name} is not closed`);
}

const service = code('AndroidBackgroundWakeWordService.kt');
const moduleSrc = code('AndroidBackgroundWakeWordModule.kt');

describe('AndroidBackgroundWakeWordService answers every start (Claw build 535 crash)', () => {
  it('never stops without a start id: a bare stopSelf() also drops a queued startForegroundService()', () => {
    expect(service).not.toMatch(/\bstopSelf\s*\(/);
    expect(service).not.toMatch(/\bstopService\s*\(/);
    expect(service).toMatch(/\bstopSelfResult\s*\(\s*startId\s*\)/);
    // The only way to stop is stopSafely(<a start id>).
    const stops = service.replace(/fun stopSafely\(/, '').match(/\bstopSafely\s*\(([^)]*)\)/g) ?? [];
    expect(stops.length).toBeGreaterThan(0);
    for (const call of stops) {
      expect(call).toMatch(/stopSafely\s*\(\s*(startId|lastStartId)\s*\)/);
    }
  });

  it('onCreate does not start the foreground or stop: onStartCommand does that for its own start', () => {
    const onCreate = body(service, 'onCreate');
    expect(onCreate).not.toMatch(/startForeground|stopSafely|stopSelf|refreshConfigAndRuntime/);
  });

  it('startForegroundCompat only reports whether startForeground worked; it never stops the service', () => {
    const compat = body(service, 'startForegroundCompat');
    expect(compat).toMatch(/startForeground\(/);
    expect(compat).not.toMatch(/stopSafely|stopSelf/);
  });

  it('onStartCommand: STOP stops with its own id; any other start calls startForeground before anything else', () => {
    const onStart = body(service, 'onStartCommand');
    expect(onStart).toMatch(/lastStartId\s*=\s*startId/);
    const stopBranch = onStart.match(/if\s*\(\s*intent\?\.action\s*==\s*ACTION_STOP\s*\)\s*\{([^}]*)\}/);
    expect(stopBranch).not.toBeNull();
    expect(stopBranch![1]).toMatch(/stopSafely\(\s*startId\s*\)/);
    expect(stopBranch![1]).not.toMatch(/startForeground/);

    const afterStop = onStart.slice(onStart.indexOf(stopBranch![0]) + stopBranch![0].length);
    const first = afterStop.search(/startForegroundCompat\(\)/);
    expect(first).toBeGreaterThanOrEqual(0);
    for (const later of [/stopSafely\(/, /refreshConfigAndRuntime\(/, /hasRecordPermission\(/]) {
      const at = afterStop.search(later);
      expect(at).toBeGreaterThan(first);
    }
    // Every other way out of onStartCommand also uses this start's id.
    expect(onStart.match(/stopSafely\(\s*startId\s*\)/g)?.length).toBeGreaterThanOrEqual(3);
  });
});

describe('AndroidBackgroundWakeWordModule does not start the service just to sync a setting', () => {
  it('syncConfig saves the config and refreshes a running service in this process, never starting one', () => {
    const sync = body(moduleSrc, 'syncConfig');
    expect(sync).toMatch(/BackgroundWakeWordPreferences\.saveConfig\(/);
    expect(sync).toMatch(/AndroidBackgroundWakeWordService\.refreshIfRunning\(\)/);
    expect(sync).not.toMatch(/enqueueRefresh|enqueueStart|startForegroundService|startService/);
    // No REFRESH start is left for anyone to call.
    expect(service).not.toMatch(/fun enqueueRefresh/);
    const refresh = body(service, 'refreshIfRunning');
    expect(refresh).toMatch(/mainHandler\.post/);
    expect(refresh).not.toMatch(/startForegroundService|startService|Intent\(/);
  });

  it('a stop is always sent, also before the service ran onCreate, so a start still in flight is stopped', () => {
    const stop = body(service, 'enqueueStop');
    expect(stop).not.toMatch(/\breturn\b/);
    expect(stop).toMatch(/context\.startService\(/);
  });
});

describe('the service is started in front and listens only in the back (Claw build 536)', () => {
  it('in front it shows no ball and does not listen; the check comes before any overlay or microphone', () => {
    const refresh = body(service, 'refreshConfigAndRuntime');
    const guard = refresh.match(/if\s*\(\s*appInForeground\s*\)\s*\{([^}]*)\}/);
    expect(guard).not.toBeNull();
    expect(guard![1]).toMatch(/removeOverlay\(\)/);
    expect(guard![1]).toMatch(/stopMonitoring\(\)/);
    expect(guard![1]).toMatch(/\breturn\b/);
    expect(guard![1]).not.toMatch(/startMonitoring|updateOverlay/);
    const at = refresh.indexOf(guard![0]);
    expect(refresh.search(/updateOverlay\(\)/)).toBeGreaterThan(at);
    expect(refresh.search(/startMonitoring\(/)).toBeGreaterThan(at);
  });

  it('after a sticky restart nothing is in front; the app flag is set only by the app and refreshes a running service', () => {
    expect(service).toMatch(/@Volatile var appInForeground: Boolean = false\s+private set/);
    const set = body(service, 'setAppInForeground');
    expect(set).toMatch(/appInForeground\s*=\s*foreground/);
    expect(set).toMatch(/refreshIfRunning\(\)/);
    expect(set).not.toMatch(/startForegroundService|startService/);
    expect(body(moduleSrc, 'setAppForeground')).toMatch(/AndroidBackgroundWakeWordService\.setAppInForeground\(foreground\)/);
  });

  it('the running instance is known only between onCreate and onDestroy', () => {
    expect(body(service, 'onCreate')).toMatch(/instance\s*=\s*this/);
    expect(body(service, 'onDestroy')).toMatch(/if\s*\(\s*instance\s*===\s*this\s*\)\s*instance\s*=\s*null/);
  });
});
