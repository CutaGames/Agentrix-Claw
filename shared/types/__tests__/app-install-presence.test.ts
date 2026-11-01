import { describe, expect, it } from '@jest/globals';
import {
  APP_INSTALL_HEADERS_V1,
  APP_INSTALL_HEADER_KEYS_V1,
  APP_INSTALL_PRESENCE_FLAG_V1,
  APP_INSTALL_PRESENCE_RETENTION_DAYS_V1,
  appInstallIdFromBytesV1,
  decodeAppInstallPresenceHeadersV1,
  isAppInstallIdHeaderNameV1,
  isAppInstallIdV1,
  isAppInstallPlatformV1,
  isAppInstallVersionV1,
  redactAppInstallIdInTextV1,
  scrubAppInstallIdV1,
} from '../app-install-presence';

const ID = '123e4567-e89b-42d3-a456-426614174000';

describe('app install presence contract (L8-14 item 10, A30)', () => {
  it('pins the names and the retention', () => {
    expect(APP_INSTALL_PRESENCE_FLAG_V1).toBe('APP_INSTALL_PRESENCE_V1_ENABLED');
    expect(APP_INSTALL_HEADERS_V1).toEqual({ version: 'X-Agentrix-App-Version', platform: 'X-Agentrix-Platform', installId: 'X-Agentrix-Install-Id' });
    for (const key of Object.keys(APP_INSTALL_HEADERS_V1) as Array<keyof typeof APP_INSTALL_HEADERS_V1>) {
      expect(APP_INSTALL_HEADER_KEYS_V1[key]).toBe(APP_INSTALL_HEADERS_V1[key].toLowerCase());
    }
    expect(APP_INSTALL_PRESENCE_RETENTION_DAYS_V1).toBe(90);
  });

  it('makes a UUID v4 from 16 bytes, deterministic for the same bytes', () => {
    const bytes = Array.from({ length: 16 }, (_, index) => index * 16 + 7);
    const id = appInstallIdFromBytesV1(bytes);
    expect(isAppInstallIdV1(id)).toBe(true);
    expect(appInstallIdFromBytesV1(bytes)).toBe(id);
    expect(id[14]).toBe('4');
    expect('89ab').toContain(id[19]);
    expect(isAppInstallIdV1(appInstallIdFromBytesV1(new Uint8Array(16).fill(255)))).toBe(true);
    expect(isAppInstallIdV1(appInstallIdFromBytesV1(new Uint8Array(16)))).toBe(true);
    expect(() => appInstallIdFromBytesV1([1, 2, 3])).toThrow();
  });

  it('accepts only a lower-case UUID v4, a version number and android / ios', () => {
    expect(isAppInstallIdV1(ID)).toBe(true);
    for (const bad of [ID.toUpperCase(), ID.replace('42d3', '12d3'), ID.replace('a456', 'c456'), `${ID} `, ID.slice(1), '', null, undefined, 5, [ID]]) {
      expect(isAppInstallIdV1(bad)).toBe(false);
    }
    for (const good of ['1.4.4', '1.0', '10.20.30', '1.2.3.4']) expect(isAppInstallVersionV1(good)).toBe(true);
    for (const bad of ['', '1', '1.4.4-beta', 'v1.4.4', '1.4.4 ', '12345.1.1', '1.4.4.4.4', null, 144, ['1.4.4']]) expect(isAppInstallVersionV1(bad)).toBe(false);
    expect(isAppInstallPlatformV1('android')).toBe(true);
    expect(isAppInstallPlatformV1('ios')).toBe(true);
    for (const bad of ['Android', 'web', 'react-native', '', undefined]) expect(isAppInstallPlatformV1(bad)).toBe(false);
  });

  it('decodes only when all three headers are present, single and well formed; otherwise null and no throw', () => {
    const headers: Record<string, unknown> = { 'x-agentrix-install-id': ID, 'x-agentrix-platform': 'android', 'x-agentrix-app-version': '1.4.4' };
    const read = (h: Record<string, unknown>) => (name: string) => h[name];
    expect(decodeAppInstallPresenceHeadersV1(read(headers))).toEqual({ installId: ID, platform: 'android', appVersion: '1.4.4' });
    for (const name of Object.keys(headers)) {
      const missing = { ...headers };
      delete missing[name];
      expect(decodeAppInstallPresenceHeadersV1(read(missing))).toBeNull();
    }
    expect(decodeAppInstallPresenceHeadersV1(read({ ...headers, 'x-agentrix-install-id': [ID, ID] }))).toBeNull();
    expect(decodeAppInstallPresenceHeadersV1(read({ ...headers, 'x-agentrix-platform': 'Android' }))).toBeNull();
    expect(decodeAppInstallPresenceHeadersV1(read({ ...headers, 'x-agentrix-app-version': 'latest' }))).toBeNull();
    expect(decodeAppInstallPresenceHeadersV1(read({ ...headers, 'x-agentrix-install-id': `${ID}\nX-Evil: 1` }))).toBeNull();
    expect(
      decodeAppInstallPresenceHeadersV1(() => {
        throw new Error('headers object exploded');
      }),
    ).toBeNull();
  });

  it('redacts an id written after the header name, in any letter case and either separator, and nothing else', () => {
    expect(redactAppInstallIdInTextV1(`X-Agentrix-Install-Id: ${ID}`)).toBe('X-Agentrix-Install-Id: [redacted]');
    expect(redactAppInstallIdInTextV1(`"x-agentrix-install-id":"${ID}"`)).toBe('"x-agentrix-install-id":"[redacted]"');
    expect(redactAppInstallIdInTextV1(`x-agentrix-install-id=${ID.toUpperCase()}`)).toBe('x-agentrix-install-id=[redacted]');
    expect(redactAppInstallIdInTextV1(`order ${ID}`)).toBe(`order ${ID}`);
    expect(isAppInstallIdHeaderNameV1('X-AGENTRIX-INSTALL-ID')).toBe(true);
    expect(isAppInstallIdHeaderNameV1('x-agentrix-platform')).toBe(false);
  });

  it('scrubs a nested value without changing the input, keeps other data, leaves class instances alone', () => {
    const when = new Date('2026-10-31T00:00:00Z');
    const input = {
      request: { headers: { 'X-Agentrix-Install-Id': ID, accept: 'json' } },
      list: [{ line: `x-agentrix-install-id: ${ID}` }, `seen ${ID} here`],
      when,
      n: 3,
    };
    const snapshot = JSON.stringify(input);
    const out = scrubAppInstallIdV1(input, ID);
    expect(JSON.stringify(input)).toBe(snapshot);
    expect(JSON.stringify(out)).not.toContain(ID);
    expect(out.request.headers.accept).toBe('json');
    expect(out.request.headers['X-Agentrix-Install-Id']).toBe('[redacted]');
    expect(out.list[1]).toBe('seen [install-id] here');
    expect(out.when).toBe(when);
    expect(out.n).toBe(3);
    // Without a known id only the header name and the written-out form are masked.
    expect(JSON.stringify(scrubAppInstallIdV1(input))).toContain(`seen ${ID} here`);
    // A known id that is not a UUID v4 is ignored rather than used as a substring pattern.
    expect(scrubAppInstallIdV1({ a: 'abc' }, 'a')).toEqual({ a: 'abc' });
  });
});
