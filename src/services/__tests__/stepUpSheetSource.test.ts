/**
 * StepUpSheet and stepUpSession (React Native code, read as source; the logic is in stepUp.ts and tested
 * there): confirmed only by a decoded finish, a wrong code never signs out, the web link stays on
 * agentrix.top, the token is replaced like a sign-in.
 */
import { describe, it, expect } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..', '..', '..');
const read = (p: string) =>
  fs
    .readFileSync(path.join(ROOT, p), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\r\n]*/g, '');
const sheet = read('src/components/StepUpSheet.tsx');
const session = read('src/services/stepUpSession.ts');

describe('StepUpSheet', () => {
  it('onConfirmed runs only after finish and the token swap', () => {
    const confirm = sheet.slice(sheet.indexOf('const confirm = async'), sheet.indexOf('const openWeb'));
    const finish = confirm.indexOf('finishEmailCode(');
    const swap = confirm.indexOf('applyStepUpToken(done.accessToken)');
    const confirmed = confirm.indexOf('onConfirmed()');
    expect(finish).toBeGreaterThan(0);
    expect(swap).toBeGreaterThan(finish);
    expect(confirmed).toBeGreaterThan(swap);
    expect(sheet.match(/onConfirmed\(\)/g)).toHaveLength(1);
  });

  it('only 重新登录 signs out; a failed confirm goes back to the code', () => {
    expect(sheet.match(/clearAuth\(\)/g)).toHaveLength(1);
    const signInAgain = sheet.slice(sheet.indexOf('const signInAgain'), sheet.indexOf('const resendIn'));
    expect(signInAgain).toContain('clearAuth()');
    const confirm = sheet.slice(sheet.indexOf('const confirm = async'), sheet.indexOf('const openWeb'));
    expect(confirm).not.toContain('clearAuth');
    expect(confirm).toMatch(/setPhase\(\{ \.\.\.phase, kind: 'code' \}\)/);
  });

  it('到网页上确认 opens only an https agentrix.top page, else the web home', () => {
    const openWeb = sheet.slice(sheet.indexOf('const openWeb'), sheet.indexOf('const signInAgain'));
    expect(openWeb).toContain('https:\\/\\/(?:[a-z0-9-]+\\.)*agentrix\\.top(?:\\/|$)');
    expect(openWeb).toContain(': APP_URL');
    expect(sheet.match(/Linking\.openURL\(/g)).toHaveLength(1);
  });

  it('the code field takes six digits only', () => {
    expect(sheet).toMatch(/replace\(\/\[\^0-9\]\/g, ''\)\.slice\(0, 6\)/);
    expect(sheet).toMatch(/disabled=\{code\.length !== 6/);
  });
});

describe('stepUpSession', () => {
  it('replaces the token where a sign-in puts it, keeping the user', () => {
    const apply = session.slice(session.indexOf('export async function applyStepUpToken'));
    expect(apply).toMatch(/if \(!user \|\| !accessToken\) throw/);
    expect(apply).toMatch(/setApiConfig\(\{ token: accessToken \}\)/);
    expect(apply).toMatch(/await saveTokenToStorage\(accessToken\)/);
    expect(apply).toMatch(/setAuth\(user, accessToken\)/);
  });
});
