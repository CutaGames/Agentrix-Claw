/**
 * 事项 → 电脑上 lists bound computers, and other presence rows only while online (desktopDevicesView.ts).
 */
import { describe, it, expect } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import { isListedComputer, listedComputers } from '../desktopDevicesView';

const bound = { deviceId: 'dev_3f9a', platform: 'darwin', lastSeenAt: '2026-09-01T00:00:00.000Z', isOnline: false };
const oldRow = { deviceId: 'desktop-6a1c2e9e-0b1d-4b9e-9c52-3d0f5a7b1c11', platform: 'darwin', lastSeenAt: '2026-08-31T23:59:00.000Z', isOnline: false };
const unboundRunning = { deviceId: 'desktop-0f5d', platform: 'win32', lastSeenAt: '2026-10-01T06:00:00.000Z', isOnline: true };

describe('which computers are listed', () => {
  it('a bound computer, online or not', () => {
    expect(isListedComputer(bound)).toBe(true);
    expect(isListedComputer({ ...bound, isOnline: true })).toBe(true);
  });

  it('a row from before binding only while it is online', () => {
    expect(isListedComputer(oldRow)).toBe(false);
    expect(isListedComputer(unboundRunning)).toBe(true);
  });

  it('an older backend without isOnline: listed, as before', () => {
    expect(isListedComputer({ deviceId: 'desktop-legacy' })).toBe(true);
  });

  it('no id, no row', () => {
    expect(isListedComputer({ deviceId: '' })).toBe(false);
    expect(isListedComputer({ deviceId: undefined as unknown as string })).toBe(false);
  });

  it('the same computer bound since shows once; the server order is kept', () => {
    expect(listedComputers([unboundRunning, bound, oldRow])).toEqual([unboundRunning, bound]);
    expect(listedComputers([oldRow])).toEqual([]);
    expect(listedComputers(null)).toEqual([]);
    expect(listedComputers(undefined)).toEqual([]);
  });
});

describe('the screens use the rule', () => {
  const read = (p: string) =>
    fs
      .readFileSync(path.resolve(__dirname, '..', '..', '..', p), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\r\n]*/g, '');

  it('电脑上 lists, selects and groups receipts by listed computers only', () => {
    const screen = read('src/screens/agent/DesktopControlScreen.tsx');
    expect(screen).toMatch(/const devices = listedComputers\(state\?\.devices\)/);
    expect(screen).toMatch(/listedComputers\(next\.devices\)\[0\]/);
    expect(screen).not.toMatch(/next\.devices\[0\]/);
    expect(screen).not.toMatch(/state\?\.devices \|\|/);
  });

  it('the 电脑上 tab shows only when a listed computer exists', () => {
    const home = read('src/screens/four-zone/MattersHomeScreen.tsx');
    expect(home).toMatch(/hasPairedComputer = listedComputers\(desktop\.data\?\.devices\)\.length > 0/);
    expect(home).not.toMatch(/desktop\.data\?\.devices\?\.length/);
  });
});
