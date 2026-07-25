/**
 * Unit tests for readBase64 helpers.
 *
 * The crashy "Cannot read property 'Base64' of undefined" issue showed up
 * because the SDK 54 expo-file-system rewrite removed the legacy
 * `EncodingType` enum from the top-level module. These tests pin the
 * fallback chain so a regression flips this test red instead of crashing
 * users on the camera-scan screen.
 */

// Mock expo-file-system *before* requiring the helper so the require()
// inside readBase64.ts picks up our mock.
const mockBase64 = jest.fn(async () => 'aGVsbG8='); // "hello"
const mockFileCtor = jest.fn().mockImplementation(() => ({
  base64: mockBase64,
  type: 'image/jpeg',
}));

jest.mock('expo-file-system', () => ({
  __esModule: true,
  File: mockFileCtor,
  Paths: { cache: { uri: 'file:///cache/' } },
}));

jest.mock('expo-file-system/legacy', () => ({
  __esModule: true,
  readAsStringAsync: jest.fn(async () => 'bGVnYWN5'),
  writeAsStringAsync: jest.fn(async () => undefined),
  cacheDirectory: 'file:///legacy-cache/',
  documentDirectory: 'file:///legacy-doc/',
  EncodingType: { Base64: 'base64', UTF8: 'utf8' },
  deleteAsync: jest.fn(async () => undefined),
}), { virtual: true });

import {
  readUriAsBase64,
  readUriAsDataUrl,
  uriRequiresInlining,
  getCacheDirectoryUri,
} from '../readBase64';

describe('readBase64 helpers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('readUriAsBase64 prefers File API', async () => {
    const result = await readUriAsBase64('content://media/photo.jpg');
    expect(result).toBe('aGVsbG8=');
    expect(mockFileCtor).toHaveBeenCalledWith('content://media/photo.jpg');
    expect(mockBase64).toHaveBeenCalledTimes(1);
  });

  it('readUriAsBase64 throws when File API throws and legacy is missing readAsStringAsync', async () => {
    mockBase64.mockRejectedValueOnce(new Error('boom'));
    const legacy = require('expo-file-system/legacy');
    legacy.readAsStringAsync.mockResolvedValueOnce('bGVnYWN5');
    const result = await readUriAsBase64('file:///foo.png');
    // Legacy fallback should kick in and return its value
    expect(result).toBe('bGVnYWN5');
  });

  it('readUriAsBase64 rejects on empty URI', async () => {
    await expect(readUriAsBase64('')).rejects.toThrow();
  });

  it('readUriAsDataUrl pass-throughs data: URIs unchanged', async () => {
    const dataUrl = 'data:image/png;base64,iVBORw0KGgo';
    const out = await readUriAsDataUrl(dataUrl);
    expect(out).toBe(dataUrl);
    expect(mockFileCtor).not.toHaveBeenCalled();
  });

  it('readUriAsDataUrl wraps base64 with mime', async () => {
    const out = await readUriAsDataUrl('content://x.jpg');
    expect(out).toBe('data:image/jpeg;base64,aGVsbG8=');
  });

  it('readUriAsDataUrl infers mime from extension', async () => {
    const out = await readUriAsDataUrl('file:///some/song.m4a');
    expect(out).toBe('data:audio/mp4;base64,aGVsbG8=');
  });

  it('uriRequiresInlining catches content:// and ph://', () => {
    expect(uriRequiresInlining('content://media/x.jpg')).toBe(true);
    expect(uriRequiresInlining('ph://abcdef')).toBe(true);
    expect(uriRequiresInlining('asset-library://asset/asset.JPG')).toBe(true);
    expect(uriRequiresInlining('file:///cache/x.jpg')).toBe(false);
    expect(uriRequiresInlining('https://example.com/x.jpg')).toBe(false);
  });

  it('getCacheDirectoryUri prefers Paths.cache.uri', () => {
    expect(getCacheDirectoryUri()).toBe('file:///cache/');
  });
});
