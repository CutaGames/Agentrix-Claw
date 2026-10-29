/**
 * L8-8 ALERT-1: the phone sends its interface language with the push token, so the server writes each push in it.
 * A language it does not know is left out (the server then keeps its Chinese default for this token).
 */
import { describe, it, expect } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import { buildPushRegistrationBody, pushRegistrationLocale } from '../pushRegistration';

describe('push registration body', () => {
  it('carries the interface language next to the token and platform', () => {
    expect(buildPushRegistrationBody({ token: 'ExponentPushToken[a]', platform: 'android', language: 'en' })).toEqual({
      token: 'ExponentPushToken[a]',
      platform: 'android',
      locale: 'en',
    });
    expect(buildPushRegistrationBody({ token: 'ExponentPushToken[a]', platform: 'ios', deviceId: 'iPhone16,1', language: 'zh' })).toEqual({
      token: 'ExponentPushToken[a]',
      platform: 'ios',
      deviceId: 'iPhone16,1',
      locale: 'zh',
    });
  });

  it.each([undefined, null, '', 'fr', 'en-US', 'EN', 7, {}, ['en']])('leaves the language out when it is %p', (language) => {
    const body = buildPushRegistrationBody({ token: 't', platform: 'android', language });
    expect(body).toEqual({ token: 't', platform: 'android' });
    expect('locale' in body).toBe(false);
    expect(pushRegistrationLocale(language)).toBeUndefined();
  });

  it('sends nothing but the token, platform, device and language', () => {
    const body = buildPushRegistrationBody({ token: 't', platform: 'android', deviceId: 'd', language: 'zh' });
    expect(Object.keys(body).sort()).toEqual(['deviceId', 'locale', 'platform', 'token']);
  });

  it('the app registers its token through this helper with the current interface language', () => {
    const app = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'App.tsx'), 'utf8');
    const call = app.slice(app.indexOf("apiFetch('/notifications/register'"));
    expect(call).toMatch(/buildPushRegistrationBody\(\{[\s\S]{0,200}language: getCurrentLanguage\(\)/);
    const service = fs.readFileSync(path.join(__dirname, '..', 'notifications.ts'), 'utf8');
    expect(service).toMatch(/buildPushRegistrationBody\(\{[\s\S]{0,300}language: getCurrentLanguage\(\)/);
  });
});
