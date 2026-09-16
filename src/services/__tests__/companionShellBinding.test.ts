import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { OpenClawInstance } from '../../stores/authStore';
import {
  COMPANION_SHELL_PLACEHOLDER_ID,
  agentAccountIdOf,
  resolveCompanionShellBinding,
} from '../companionShellBinding';

const ROOT = resolve(__dirname, '../../..');

function instance(overrides: Partial<OpenClawInstance> & { id: string }): OpenClawInstance {
  return { name: `Instance ${overrides.id}`, ...overrides } as OpenClawInstance;
}

const primary = instance({ id: 'inst-1', name: 'Aira', agentAccountId: 'agent-A' });
const secondary = instance({ id: 'inst-2', name: 'Bo', metadata: { agentAccountId: 'agent-B' } });
const unmapped = instance({ id: 'inst-3', name: 'Nameless' });

describe('MTR-R09.8 / M1.4.6 — the Companion Shell is bound to SoulCoreRef.agentAccountId (decision d-35)', () => {
  it('reads agentAccountId from the instance or its metadata, never guessing', () => {
    expect(agentAccountIdOf(primary)).toBe('agent-A');
    expect(agentAccountIdOf(secondary)).toBe('agent-B');
    expect(agentAccountIdOf(unmapped)).toBeUndefined();
    expect(agentAccountIdOf(null)).toBeUndefined();
  });

  describe('legacy IA — unchanged pre-V7 behaviour', () => {
    it('follows authStore.activeInstance', () => {
      const shell = resolveCompanionShellBinding({ agentFirst: false, activeInstance: primary, instances: [primary, secondary] });
      expect(shell).toMatchObject({
        id: 'inst-1',
        instanceId: 'inst-1',
        shellKey: 'inst-1',
        agentAccountId: 'agent-A',
        name: 'Aira',
        isPlaceholder: false,
        source: 'active_instance',
      });
    });

    it('ignores the presentation selection entirely', () => {
      const shell = resolveCompanionShellBinding({
        agentFirst: false,
        activeInstance: primary,
        instances: [primary, secondary],
        selectedAgentId: 'agent-B',
      });
      expect(shell.shellKey).toBe('inst-1');
      expect(shell.source).toBe('active_instance');
    });

    it('is a placeholder without an active instance', () => {
      const shell = resolveCompanionShellBinding({ agentFirst: false, activeInstance: null });
      expect(shell.isPlaceholder).toBe(true);
      expect(shell.id).toBe(COMPANION_SHELL_PLACEHOLDER_ID);
      expect(shell.source).toBe('placeholder');
    });
  });

  describe('Agent-first IA — the Shell is the canonical Agent', () => {
    it('keys the Shell on the selected agentAccountId and finds the instance that drives it', () => {
      const shell = resolveCompanionShellBinding({
        agentFirst: true,
        selectedAgentId: 'agent-B',
        instances: [primary, secondary],
        activeInstance: primary,
      });
      expect(shell).toMatchObject({
        agentAccountId: 'agent-B',
        shellKey: 'agent-B',
        instanceId: 'inst-2',
        id: 'inst-2',
        name: 'Bo',
        isPlaceholder: false,
        source: 'soul_core_ref',
      });
    });

    it('falls back to the Agent the active runtime instance maps to (same precedence as the agent directory)', () => {
      const shell = resolveCompanionShellBinding({
        agentFirst: true,
        instances: [primary, secondary],
        activeInstance: secondary,
      });
      expect(shell.agentAccountId).toBe('agent-B');
      expect(shell.shellKey).toBe('agent-B');
      expect(shell.instanceId).toBe('inst-2');
    });

    it('does not change identity when only the driving instance changes (MTR-R17.6)', () => {
      const before = resolveCompanionShellBinding({ agentFirst: true, selectedAgentId: 'agent-A', instances: [primary], activeInstance: primary });
      const after = resolveCompanionShellBinding({ agentFirst: true, selectedAgentId: 'agent-A', instances: [primary], activeInstance: secondary });
      expect(before.shellKey).toBe('agent-A');
      expect(after.shellKey).toBe('agent-A');
      expect(after.instanceId).toBe('inst-1');
    });

    it('stays stable on the agentAccountId when no runtime instance maps to it yet', () => {
      const shell = resolveCompanionShellBinding({
        agentFirst: true,
        selectedAgentId: 'agent-Z',
        instances: [primary],
        activeInstance: primary,
      });
      expect(shell).toMatchObject({
        id: 'agent-Z',
        agentAccountId: 'agent-Z',
        instanceId: null,
        shellKey: 'agent-Z',
        isPlaceholder: false,
        source: 'soul_core_ref',
      });
      expect(shell.name).toBe('Agent agent-Z');
    });

    it('is a placeholder when neither a selection nor a mapped active instance exists', () => {
      const shell = resolveCompanionShellBinding({ agentFirst: true, instances: [unmapped], activeInstance: unmapped });
      expect(shell.isPlaceholder).toBe(true);
      expect(shell.agentAccountId).toBeNull();
      expect(shell.source).toBe('placeholder');
    });

    it('never binds the Shell identity to the runtime instance id', () => {
      for (const selectedAgentId of ['agent-A', 'agent-B', undefined]) {
        const shell = resolveCompanionShellBinding({ agentFirst: true, selectedAgentId, instances: [primary, secondary], activeInstance: primary });
        expect(shell.shellKey).not.toMatch(/^inst-/);
      }
    });
  });

  it('is what activePet.service feeds from the stores, reading the IA flag per call', () => {
    const source = readFileSync(resolve(ROOT, 'src/services/activePet.service.ts'), 'utf8');
    expect(source).toContain("from './companionShellBinding'");
    expect(source.match(/resolveCompanionShellBinding\(/g)?.length).toBeGreaterThanOrEqual(2);
    expect(source).toContain('useMobileAgentSelectionStore');
    // Per render / per call, never at module scope (MTR-R06.4).
    expect(source).not.toMatch(/^const\s+\w+\s*=\s*isAgentFirstIaEnabled\(\)/m);
    expect(source).toMatch(/useMemo<ActivePet>\(\s*\(\)\s*=>\s*resolveCompanionShellBinding\(/);
  });
});
