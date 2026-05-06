import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Tests for /public/embed.js — Phase 3 W1 WB-T3.4.
 *
 * The script is plain ES5 IIFE; we evaluate it inside the jsdom window after
 * placing a fake <script data-pet-id="..."> tag.
 */

const EMBED_JS = fs.readFileSync(
  path.resolve(__dirname, '..', 'public', 'embed.js'),
  'utf8',
);

function loadEmbedScript() {
  // Run the IIFE against the current jsdom window/document.
  // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
  new Function(EMBED_JS).call(window);
}

describe('embed.js (WB-T3.4)', () => {
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

  it('injects a sandboxed iframe immediately after the host script', () => {
    const script = document.createElement('script');
    script.setAttribute('data-pet-id', 'pet-abc-123');
    script.setAttribute('data-width', '400');
    script.setAttribute('data-height', '500');
    Object.defineProperty(document, 'currentScript', { value: script, configurable: true });
    document.body.appendChild(script);

    loadEmbedScript();

    const iframes = document.querySelectorAll('iframe[data-agentrix-embed="1"]');
    expect(iframes).toHaveLength(1);
    const iframe = iframes[0] as HTMLIFrameElement;
    expect(iframe.getAttribute('sandbox')).toContain('allow-scripts');
    expect(iframe.getAttribute('sandbox')).toContain('allow-same-origin');
    expect(iframe.src).toContain('/embed/pet/pet-abc-123');
    expect(iframe.style.width).toBe('400px');
    expect(iframe.style.height).toBe('500px');
    expect(iframe.getAttribute('referrerpolicy')).toBe('no-referrer');
  });

  it('rejects malformed pet ids', () => {
    const script = document.createElement('script');
    script.setAttribute('data-pet-id', 'evil id with spaces & <script>');
    Object.defineProperty(document, 'currentScript', { value: script, configurable: true });
    document.body.appendChild(script);

    loadEmbedScript();
    expect(document.querySelectorAll('iframe[data-agentrix-embed="1"]')).toHaveLength(0);
  });

  it('falls back to default size on invalid width/height attrs', () => {
    const script = document.createElement('script');
    script.setAttribute('data-pet-id', 'abc-123');
    script.setAttribute('data-width', 'not-a-number');
    Object.defineProperty(document, 'currentScript', { value: script, configurable: true });
    document.body.appendChild(script);

    loadEmbedScript();
    const iframe = document.querySelector('iframe[data-agentrix-embed="1"]') as HTMLIFrameElement;
    expect(iframe.style.width).toBe('320px'); // default
  });

  it('is idempotent (mounts only once per script tag)', () => {
    const script = document.createElement('script');
    script.setAttribute('data-pet-id', 'abc-123');
    Object.defineProperty(document, 'currentScript', { value: script, configurable: true });
    document.body.appendChild(script);

    loadEmbedScript();
    loadEmbedScript();
    loadEmbedScript();
    expect(document.querySelectorAll('iframe[data-agentrix-embed="1"]')).toHaveLength(1);
  });

  it('does nothing when no data-pet-id is present', () => {
    Object.defineProperty(document, 'currentScript', { value: null, configurable: true });
    loadEmbedScript();
    expect(document.querySelectorAll('iframe[data-agentrix-embed="1"]')).toHaveLength(0);
  });
});
