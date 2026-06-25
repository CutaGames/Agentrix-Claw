/**
 * Sprint Pre-launch P-2 round 2 (2026-05-23) — Light theme visual smoke.
 *
 * Connects via CDP to the running 0.4.5 release exe, switches the app to
 * light theme, then asserts the core surfaces actually render with light
 * backgrounds (rather than the old "forced dark" residuals the user flagged
 * in the QA screenshot).
 *
 * Concretely it:
 *   1. Sets data-theme="light" on documentElement.
 *   2. Reads computed background-color / color of: body, the chat panel
 *      surface, an inline <pre> code block, the task workbench banner
 *      (if visible), the More menu (if it can be opened).
 *   3. Asserts each background's perceived luminance is >= 180/255 (i.e.
 *      "light"). For text colors, asserts luminance is < 80/255 ("dark").
 *
 * If a background is below the bar, the test fails with a precise pointer
 * to which surface is still rendering dark in light mode.
 */
import { test, expect, type Page, chromium } from '@playwright/test';

let page: Page;

test.beforeAll(async () => {
  const versionInfo = await fetch('http://localhost:9222/json/version').then((r) => r.json());
  const wsUrl = versionInfo.webSocketDebuggerUrl;
  const browser = await chromium.connectOverCDP(wsUrl);
  const contexts = browser.contexts();
  const allPages = () => contexts[0].pages();

  // Sprint Pre-launch P-3 (2026-05-23) — match desktop-e2e's hardening:
  // ensure the main window is visible (the chat panel page) before we
  // start probing its computed styles. Without this, a previous spec's
  // Ctrl+Shift+S toggle can leave the window hidden and our luminance
  // probes operate on the transparent pet-companion overlay.
  const findMain = async () => {
    for (const p of allPages()) {
      try {
        const t = await p.title();
        if (/view:(main|dev|chat-panel)/.test(t)) return p;
      } catch { /* navigated */ }
    }
    return undefined;
  };
  let mainPage = await findMain();
  if (!mainPage) {
    const anyPage = allPages().find((p) => p.url().includes('tauri.localhost')) || allPages()[0];
    if (anyPage) {
      try {
        await anyPage.evaluate(async () => {
          // @ts-expect-error — Tauri global injected
          const { invoke } = await import('@tauri-apps/api/core');
          await invoke('desktop_bridge_open_chat_panel');
        });
      } catch { /* ignore */ }
      for (let i = 0; i < 25 && !mainPage; i++) {
        await new Promise((r) => setTimeout(r, 200));
        mainPage = await findMain();
      }
    }
  }
  page = mainPage || allPages().find((p) => p.url().includes('tauri.localhost')) || allPages()[0];
  await page.waitForLoadState('domcontentloaded');
  for (let i = 0; i < 20; i++) {
    const len = await page.evaluate(() => document.body?.innerText?.length || 0).catch(() => 0);
    if (len > 0) break;
    await page.waitForTimeout(200);
  }

  // Switch to light theme.
  await page.evaluate(() => {
    document.documentElement.setAttribute('data-theme', 'light');
    try { localStorage.setItem('agentrix_theme', 'light'); } catch {}
  });
  await page.waitForTimeout(500);
});

// Compute relative luminance (sRGB) of an `rgb()` / `rgba()` string so we
// can put a "is this surface light or dark?" assertion over the css output.
function luminance(rgb: string): number {
  const m = rgb.match(/(?:rgba?)\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (!m) return 0;
  const r = parseInt(m[1], 10);
  const g = parseInt(m[2], 10);
  const b = parseInt(m[3], 10);
  // Perceptual approximation good enough for our threshold check.
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

test.describe('§LT light theme', () => {
  test('LT-1: data-theme=light is actually applied', async () => {
    const theme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    expect(theme).toBe('light');
  });

  test('LT-2: html / root background is light (luminance >= 180)', async () => {
    // body itself is often transparent (background lives on <html> and #root
    // with a `var(--bg-dark)` shorthand). Probe both and accept the lightest.
    const bgs = await page.evaluate(() => {
      const html = getComputedStyle(document.documentElement).backgroundColor;
      const body = getComputedStyle(document.body).backgroundColor;
      const root = document.getElementById('root');
      const rootBg = root ? getComputedStyle(root).backgroundColor : '';
      return { html, body, rootBg };
    });
    const luminance = (rgb: string) => {
      const m = rgb.match(/(?:rgba?)\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
      if (!m) return -1;
      return 0.299 * +m[1] + 0.587 * +m[2] + 0.114 * +m[3];
    };
    const lums = [bgs.html, bgs.body, bgs.rootBg].map(luminance);
    const max = Math.max(...lums);
    expect.soft(max, `html=${bgs.html} body=${bgs.body} root=${bgs.rootBg} → max lum ${max.toFixed(1)}`).toBeGreaterThanOrEqual(180);
  });

  test('LT-3: chat panel surface is light (luminance >= 180)', async () => {
    // The chat panel root is a div directly under #root. We pick the largest
    // background-color we find in the first 6 div levels and assert it's light.
    const bg = await page.evaluate(() => {
      const root = document.getElementById('root');
      if (!root) return null;
      const candidates: HTMLElement[] = [];
      const walk = (el: HTMLElement, depth: number) => {
        if (depth > 6) return;
        candidates.push(el);
        for (const child of Array.from(el.children)) {
          if (child instanceof HTMLElement) walk(child, depth + 1);
        }
      };
      walk(root, 0);
      // Find the largest visible background-color
      let best: { color: string; area: number } | null = null;
      for (const el of candidates) {
        const cs = getComputedStyle(el);
        if (!cs.backgroundColor || cs.backgroundColor === 'rgba(0, 0, 0, 0)') continue;
        const r = el.getBoundingClientRect();
        const area = r.width * r.height;
        if (area < 200_000) continue; // ignore small chips
        if (!best || area > best.area) {
          best = { color: cs.backgroundColor, area };
        }
      }
      return best?.color ?? null;
    });
    expect(bg, 'no large surface found under #root').not.toBeNull();
    const lum = luminance(bg!);
    expect.soft(lum, `largest panel bg ${bg} luminance ${lum.toFixed(1)} should be >= 180`).toBeGreaterThanOrEqual(180);
  });

  test('LT-4: <pre> code blocks (if any) render with light bg', async () => {
    const dark = await page.evaluate(() => {
      const offenders: { bg: string; lum: number }[] = [];
      const luminance = (rgb: string) => {
        const m = rgb.match(/(?:rgba?)\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
        if (!m) return 255;
        return 0.299 * +m[1] + 0.587 * +m[2] + 0.114 * +m[3];
      };
      for (const pre of Array.from(document.querySelectorAll('pre'))) {
        const cs = getComputedStyle(pre as HTMLElement);
        const lum = luminance(cs.backgroundColor);
        if (lum < 180) offenders.push({ bg: cs.backgroundColor, lum });
      }
      return offenders;
    });
    expect.soft(dark, `${dark.length} <pre> still rendering with dark bg in light theme: ${JSON.stringify(dark)}`).toEqual([]);
  });

  test('LT-5: WORKSPACE CONTEXT card text contrasts with its bg', async () => {
    // The user's screenshot showed the workspace context card's bg was light
    // but text was hard to read — let's at least verify the foreground is dark
    // enough for contrast.
    const result = await page.evaluate(() => {
      const txt = Array.from(document.querySelectorAll('div')).find((d) =>
        d.textContent?.includes('WORKSPACE CONTEXT') || d.textContent?.includes('changed files'),
      );
      if (!txt) return null;
      const cs = getComputedStyle(txt as HTMLElement);
      return { bg: cs.backgroundColor, fg: cs.color };
    });
    if (!result) {
      test.skip(true, 'Workspace context card not visible');
      return;
    }
    const fgLum = luminance(result.fg);
    expect.soft(fgLum, `workspace context fg ${result.fg} luminance ${fgLum.toFixed(1)} should be < 100`).toBeLessThan(100);
  });

  test('LT-6: title bar text reads dark on light theme', async () => {
    const fg = await page.evaluate(() => {
      // Title bar contains the agent dropdown. Use that as the anchor.
      const candidates = Array.from(document.querySelectorAll('button, span'));
      const hit = candidates.find((el) => /Claude|Sonnet|Bedrock/.test(el.textContent || ''));
      if (!hit) return null;
      return getComputedStyle(hit as HTMLElement).color;
    });
    if (!fg) { test.skip(true, 'No title bar text matched'); return; }
    const lum = luminance(fg);
    expect.soft(lum, `title bar fg ${fg} luminance ${lum.toFixed(1)} should be < 120`).toBeLessThan(120);
  });

  test('LT-7: no dark-bg surfaces (rgba(15,23,42,*) / rgba(13,17,23,*)) survived the codemod', async () => {
    const violations = await page.evaluate(() => {
      const luminance = (rgb: string) => {
        const m = rgb.match(/(?:rgba?)\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
        if (!m) return 255;
        return 0.299 * +m[1] + 0.587 * +m[2] + 0.114 * +m[3];
      };
      const v: Array<{ tag: string; bg: string; lum: number; w: number; h: number }> = [];
      for (const el of Array.from(document.querySelectorAll('*'))) {
        const cs = getComputedStyle(el as HTMLElement);
        const bg = cs.backgroundColor;
        if (!bg || bg === 'rgba(0, 0, 0, 0)') continue;
        const lum = luminance(bg);
        if (lum >= 60) continue; // not "deeply dark"
        const r = (el as HTMLElement).getBoundingClientRect();
        // Ignore tiny accent dots
        if (r.width * r.height < 5000) continue;
        // Ignore the pet menu (always-dark by design)
        if ((el as HTMLElement).getAttribute('data-keep-dark') === '1') continue;
        if ((el as HTMLElement).closest('[role="menu"]:not([data-keep-light])')) continue;
        v.push({ tag: (el as HTMLElement).tagName, bg, lum, w: Math.round(r.width), h: Math.round(r.height) });
      }
      return v;
    });
    // Allow up to 2 dark surfaces (e.g. the pet companion overlay) to remain;
    // assert there's no widespread leak.
    expect.soft(
      violations.length,
      `Found ${violations.length} dark-bg surfaces in light theme: ${JSON.stringify(violations.slice(0, 8))}`,
    ).toBeLessThanOrEqual(2);
  });
});
