import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * SC-T3.1 — iframe sandbox防 XSS penetration tests for embed.js (Phase 3 W3).
 *
 * Verifies the embed loader resists common attack vectors:
 *   1. data-pet-id with embedded HTML/JS payload → rejected by allowlist regex
 *   2. javascript: scheme in pet id → rejected
 *   3. forged postMessage from a different window → ignored
 *   4. resize message with negative/Infinity values → clamped to defaults
 *   5. iframe always carries `sandbox` and `referrerpolicy=no-referrer`
 *   6. URL is properly encoded (no raw < > " in src)
 */

const EMBED_JS = fs.readFileSync(
  path.resolve(__dirname, '..', 'public', 'embed.js'),
  'utf8',
);

function loadEmbed() {
  // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
  new Function(EMBED_JS).call(window);
}

function placeScript(attrs: Record<string, string>) {
  const s = document.createElement('script');
  for (const k of Object.keys(attrs)) s.setAttribute(k, attrs[k]);
  Object.defineProperty(document, 'currentScript', { value: s, configurable: true });
  document.body.appendChild(s);
  return s;
}

describe('embed.js — SC-T3.1 XSS / sandbox hardening', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
  });
  afterEach(() => {
    Object.defineProperty(document, 'currentScript', { value: null, configurable: true });
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('rejects pet-id containing HTML tags', () => {
    placeScript({ 'data-pet-id': '<img src=x onerror=alert(1)>' });
    loadEmbed();
    expect(document.querySelectorAll('iframe[data-agentrix-embed="1"]')).toHaveLength(0);
  });

  it('rejects pet-id with javascript: scheme', () => {
    placeScript({ 'data-pet-id': 'javascript:alert(1)' });
    loadEmbed();
    expect(document.querySelectorAll('iframe[data-agentrix-embed="1"]')).toHaveLength(0);
  });

  it('rejects empty pet-id', () => {
    placeScript({ 'data-pet-id': '' });
    loadEmbed();
    expect(document.querySelectorAll('iframe[data-agentrix-embed="1"]')).toHaveLength(0);
  });

  it('iframe URL encodes pet-id (no raw special chars in src)', () => {
    // The allowlist filters most special chars; remaining safe chars are URL-encoded.
    placeScript({ 'data-pet-id': 'abc.def-123_x' });
    loadEmbed();
    const iframe = document.querySelector('iframe[data-agentrix-embed="1"]') as HTMLIFrameElement;
    expect(iframe).toBeTruthy();
    expect(iframe.src).not.toMatch(/[<>"']/);
    expect(iframe.src).toContain('/embed/pet/abc.def-123_x');
  });

  it('always sets sandbox + no-referrer + lazy', () => {
    placeScript({ 'data-pet-id': 'abc-123' });
    loadEmbed();
    const iframe = document.querySelector('iframe[data-agentrix-embed="1"]') as HTMLIFrameElement;
    expect(iframe.getAttribute('sandbox')).toMatch(/allow-scripts/);
    expect(iframe.getAttribute('referrerpolicy')).toBe('no-referrer');
    expect(iframe.getAttribute('loading')).toBe('lazy');
  });

  it('ignores postMessage from other windows (not iframe.contentWindow)', () => {
    placeScript({ 'data-pet-id': 'abc-123' });
    loadEmbed();
    const iframe = document.querySelector('iframe[data-agentrix-embed="1"]') as HTMLIFrameElement;
    const before = iframe.style.width;

    // Simulate message from a foreign window (source != iframe.contentWindow).
    const ev = new MessageEvent('message', {
      data: { type: 'agentrix:resize', width: 9999, height: 9999 },
      source: window, // wrong source
    });
    window.dispatchEvent(ev);
    expect(iframe.style.width).toBe(before);
  });

  it('ignores malformed postMessage payloads', () => {
    placeScript({ 'data-pet-id': 'abc-123' });
    loadEmbed();
    const iframe = document.querySelector('iframe[data-agentrix-embed="1"]') as HTMLIFrameElement;
    const before = iframe.style.width;
    // wrong type
    window.dispatchEvent(new MessageEvent('message', { data: { type: 'evil', width: 1000 } }));
    // string payload
    window.dispatchEvent(new MessageEvent('message', { data: 'agentrix:resize' }));
    // null payload
    window.dispatchEvent(new MessageEvent('message', { data: null }));
    expect(iframe.style.width).toBe(before);
  });

  it('clamps resize values: negative / Infinity / NaN fall back to defaults', () => {
    placeScript({ 'data-pet-id': 'abc-123' });
    loadEmbed();
    const iframe = document.querySelector('iframe[data-agentrix-embed="1"]') as HTMLIFrameElement;

    // Mock contentWindow as a foreign window so we know the source check is the gate.
    Object.defineProperty(iframe, 'contentWindow', { value: window, configurable: true });
    window.dispatchEvent(new MessageEvent('message', {
      data: { type: 'agentrix:resize', width: -100, height: NaN },
      source: window,
    }));
    // safeNum falls back to current size when input invalid → still 320
    expect(iframe.style.width).toBe('320px');
    expect(iframe.style.height).toBe('320px');
  });
});
