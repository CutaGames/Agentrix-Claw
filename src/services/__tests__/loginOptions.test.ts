/**
 * E84 A (I-049): the phone's sign-in page — Google, Apple, email code first (email code third until
 * the code store and mail are fixed); the wallet and the rest under "更多方式"; "先逛逛" stays.
 * Only the screen changed: every button still calls the sign-in function it called before.
 */
import { describe, it, expect } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import { LOGIN_MORE_METHODS, LOGIN_PRIMARY_METHODS, isLoginCode, isLoginEmail } from '../loginOptions';

const ROOT = path.resolve(__dirname, '..', '..', '..');
const screen = fs.readFileSync(path.join(ROOT, 'src/screens/auth/LoginScreen.tsx'), 'utf8');

describe('login options', () => {
  it('three main buttons in the E84 order; the wallet is no longer first, or main at all', () => {
    expect(LOGIN_PRIMARY_METHODS.map((method) => method.id)).toEqual(['google', 'apple', 'email_code']);
    expect(LOGIN_MORE_METHODS.map((method) => method.id)).toEqual(['email_password', 'wallet', 'x', 'discord', 'telegram', 'openclaw']);
    const all = [...LOGIN_PRIMARY_METHODS, ...LOGIN_MORE_METHODS].map((method) => method.id);
    expect(new Set(all).size).toBe(all.length);
  });

  it('validates the email and the code before anything is sent', () => {
    expect(['a@b.co', ' name@example.com '].map(isLoginEmail)).toEqual([true, true]);
    expect(['', 'a@b', 'no at', 'a @b.co'].map(isLoginEmail)).toEqual([false, false, false, false]);
    expect(['1234', '123456', ' 12345678 '].map(isLoginCode)).toEqual([true, true, true]);
    expect(['123', '123456789', '12a456', ''].map(isLoginCode)).toEqual([false, false, false, false]);
  });
});

describe('LoginScreen wiring', () => {
  it('calls the same sign-in functions as before and keeps the guest entry', () => {
    for (const fn of ['loginWithGoogle', 'loginWithApple', 'loginWithX', 'loginWithDiscord', 'loginWithTelegram', 'loginWithEmail', 'registerWithEmail', 'sendEmailCode', 'loginWithEmailCode', 'loginWithOpenClaw', 'loginAsGuest']) {
      expect([fn, screen.includes(`${fn}`)]).toEqual([fn, true]);
    }
    expect(screen).toContain("navigate('WalletConnect')");
    expect(screen).toContain('testID="login-guest"');
    // The screen does not talk to the network itself.
    expect(screen).not.toMatch(/apiFetch|[^A-Za-z.]fetch\(/);
  });

  it('draws the main buttons from the options list and puts the rest behind 更多方式', () => {
    expect(screen).toContain('LOGIN_PRIMARY_METHODS.map((method) => methodButton(method, true))');
    expect(screen).toContain('{showMore ? <View style={styles.moreList}>{LOGIN_MORE_METHODS.map((method) => methodButton(method, false))}</View> : null}');
    expect(screen).not.toMatch(/Connect Crypto Wallet|连接加密钱包/);
  });

  it('takes its colours from the theme, not a hard-coded dark page (E83)', () => {
    expect(screen).toContain('useThemedStyles(makeStyles)');
    expect(screen).not.toMatch(/#000000|#ffffff|#aaaaaa|#888888/i);
  });

  it('the old unused login screen is gone', () => {
    expect(fs.existsSync(path.join(ROOT, 'src/screens/LoginScreen.tsx'))).toBe(false);
  });
});
