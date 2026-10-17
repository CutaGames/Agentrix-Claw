/**
 * T7 r2 (10-16): the dreaming screen on the phone. `/dreaming/*` answers 503 with `code: DREAMING_UNAVAILABLE` when the
 * engine is not switched on; the screen says "not available yet" and shows no raw error. Every other failure is
 * "can't be read right now" with a way to try again. Same rule as the desktop DreamPanel.
 */
import { describe, it, expect } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import { classifyDreamingFailure, dreamingErrorCode, readDreamingBody } from '../dreamingFailure';

const ROOT = path.resolve(__dirname, '..', '..', '..');
const read = (file: string) => fs.readFileSync(path.join(ROOT, file), 'utf8');

describe('classifyDreamingFailure', () => {
  it('only 503 with DREAMING_UNAVAILABLE is "not available yet"', () => {
    expect(classifyDreamingFailure(503, { success: false, code: 'DREAMING_UNAVAILABLE', message: 'x' })).toBe('unavailable');
    expect(classifyDreamingFailure(503, { error: { code: 'DREAMING_UNAVAILABLE' } })).toBe('unavailable');
    expect(classifyDreamingFailure(503, { message: { code: 'DREAMING_UNAVAILABLE' } })).toBe('unavailable');
  });

  it('every other failure is "can\'t be read right now"', () => {
    expect(classifyDreamingFailure(503, { code: 'SERVICE_UNAVAILABLE' })).toBe('error');
    expect(classifyDreamingFailure(503, null)).toBe('error');
    expect(classifyDreamingFailure(500, { code: 'DREAMING_UNAVAILABLE' })).toBe('error');
    expect(classifyDreamingFailure(502, { code: 'BAD_GATEWAY' })).toBe('error');
    expect(classifyDreamingFailure(500, { code: 'INTERNAL_ERROR' })).toBe('error');
  });

  it('reads codes leniently and never throws on a body that is not JSON', async () => {
    expect(dreamingErrorCode('nope')).toBeNull();
    expect(dreamingErrorCode([])).toBeNull();
    expect(await readDreamingBody({ json: async () => { throw new Error('not json'); } })).toBeNull();
    expect(await readDreamingBody({ json: async () => ({ code: 'X' }) })).toEqual({ code: 'X' });
  });
});

describe('DreamingDashboardScreen', () => {
  const screen = read('src/screens/agent/DreamingDashboardScreen.tsx');

  it('sorts both the list and the start answer, and says it once in the app language', () => {
    expect(screen.match(/classifyDreamingFailure\(res\.status, await readDreamingBody\(res\)\)/g)).toHaveLength(2);
    expect(screen).toContain("zh: '梦境引擎暂不可用'");
    expect(screen).toContain("en: 'Dreaming is not available yet'");
    expect(screen).toContain("zh: '暂时读不到。'");
    expect(screen).toContain("zh: '重试'");
  });

  it('never prints the raw error, the status code or the error code', () => {
    expect(screen).not.toMatch(/DREAMING_UNAVAILABLE/);
    expect(screen).not.toMatch(/\{res\.status\}|err\.message\}<\/Text>/);
  });

  it('the retry button is at least 44 px tall', () => {
    expect(screen).toMatch(/retryBtn: \{[^}]*minHeight: 44/);
  });
});
