/**
 * MTR-R09.8 / M1.4.6 negative assertions (decision d-32, 2026-09-16).
 *
 * Acceptance from tasks.md M1.4.6: with the Pet flag off, `App.tsx` mounts
 * nothing from `components/companion/**` or `components/pet/**`, and `rg`
 * finds no second mount point. jest cannot render `App.tsx` (no jest-expo,
 * M0.0.5 option b), so this is the source-level form of that assertion.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

const ROOT = resolve(__dirname, '../../..');
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf8');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (entry === 'node_modules' || entry === '__tests__' || entry === '__mocks__') continue;
      walk(full, out);
    } else if (/\.(tsx|ts|jsx|js)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

describe('MTR-R09.8 — the Pet surface has exactly one, gated mount point', () => {
  const app = read('App.tsx');

  it('mounts the banner and the Companion gate exactly once each, inside PetSurfaceGate', () => {
    expect(app.match(/<MobilePetProactiveBanner\s*\/>/g)).toHaveLength(1);
    expect(app.match(/<CompanionLayerGate\s*\/>/g)).toHaveLength(1);
    const gated = app.match(/<PetSurfaceGate>([\s\S]*?)<\/PetSurfaceGate>/);
    expect(gated).not.toBeNull();
    expect(gated![1]).toContain('<MobilePetProactiveBanner />');
    expect(gated![1]).toContain('<CompanionLayerGate />');
  });

  it('gates on isPetSurfaceEnabled() read per render, not at module scope', () => {
    const gate = app.match(/function PetSurfaceGate[\s\S]*?\n}/);
    expect(gate).not.toBeNull();
    expect(gate![0]).toContain('isPetSurfaceEnabled()');
    // No module-level const capturing the flag anywhere in App.tsx.
    expect(app).not.toMatch(/^const\s+\w+\s*=\s*isPetSurfaceEnabled\(\)/m);
    expect(app).not.toMatch(/^const\s+\w+\s*=\s*isAgentFirstIaEnabled\(\)/m);
  });

  it('has no second mount point for the Companion layer or the pet banner anywhere in src/', () => {
    const offenders: string[] = [];
    for (const file of walk(resolve(ROOT, 'src'))) {
      const rel = relative(ROOT, file).split(sep).join('/');
      // The components' own internals may compose each other.
      if (rel.startsWith('src/components/companion/') || rel.startsWith('src/components/pet/')) continue;
      const source = readFileSync(file, 'utf8');
      if (/<CompanionLayer\b/.test(source) || /<MobilePetProactiveBanner\b/.test(source)) {
        offenders.push(rel);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('only boots the Companion producers (greet / variant / health) when the surface is on', () => {
    const effects = read('src/app/startupEffects.ts');
    const adapters = effects.match(/export function useCompanionAdapters[\s\S]*?\r?\n}\r?\n/);
    expect(adapters).not.toBeNull();
    const body = adapters![0];
    const gateAt = body.indexOf('if (!isPetSurfaceEnabled())');
    expect(gateAt).toBeGreaterThan(0);
    for (const producer of ['bootVoiceGreetScheduler()', 'bootFormVariantWatcher()', 'bootCompanionHealthWatcher()']) {
      expect(body.indexOf(producer)).toBeGreaterThan(gateAt);
    }
    // The presence / wearable adapters stay ungated (the watch consumes them).
    expect(body.indexOf('bootPetModeAdapters(')).toBeLessThan(gateAt);
  });

  it('hides the Pet-family entries under My behind the same flag (MTR-R09.3)', () => {
    const profile = read('src/screens/me/ProfileScreen.tsx');
    expect(profile).toContain('const petSurface = isPetSurfaceEnabled();');
    for (const testId of ['me-axp-glance', 'me-earnings-center']) {
      const at = profile.indexOf(`testID="${testId}"`);
      expect(at).toBeGreaterThan(0);
      // The nearest conditional above the entry must be the flag.
      const before = profile.slice(Math.max(0, at - 600), at);
      expect(before).toMatch(/\{petSurface \? \(/);
    }
  });

  it('keeps World / Plaza / Me mounted as hidden tabs — hidden, not deleted (MTR-R09.7)', () => {
    const navigator = read('src/navigation/agent-first/AgentFirstTabNavigator.tsx');
    for (const name of ['World', 'Plaza', 'Me', 'Summon']) {
      expect(navigator).toMatch(new RegExp(`<Tab\\.Screen name="${name}"[^\\n]*options=\\{hiddenTabOptions\\}`));
    }
    // And the visible bar is still the four Agent-first destinations only.
    for (const testId of ['tab-agent', 'tab-work', 'tab-economy', 'tab-my']) {
      expect(navigator).toContain(`tabBarButtonTestID: '${testId}'`);
    }
  });
});
