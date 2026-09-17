import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  WORK_ROUTE_PATHS,
  WORK_ROUTE_SCREENS,
  isWorkRoutePath,
  normalizeWorkRoutePath,
  parseWorkRoute,
} from '../v7/workRoute';
import { parseDeveloperWorkspaceOpenRoute } from '../../services/developerWorkspaceOpenRoute';

describe('M2 A3 / MTR-R10 — Work tab deep links are validated before React Navigation sees them', () => {
  it('recognises work paths in every spelling the linking layer receives', () => {
    for (const input of ['work', '/work', 'work/machines?agentId=a1', 'agentrix://work', 'agentrix://work/approvals?approvalRef=r1']) {
      expect(isWorkRoutePath(input)).toBe(true);
    }
    for (const input of ['workflow', 'agents', '/my?section=work', 'plaza/work', '']) {
      expect(isWorkRoutePath(input)).toBe(false);
    }
  });

  it('maps the six faces onto the Work stack with a stable canonical path', () => {
    expect(Object.values(WORK_ROUTE_SCREENS).sort()).toEqual(Object.keys(WORK_ROUTE_PATHS).sort());
    expect(parseWorkRoute('agentrix://work')).toEqual({ ok: true, screen: 'WorkHome', params: {}, path: '/work' });
    expect(parseWorkRoute('work/machines?machineRef=m1&agentId=a1')).toEqual({
      ok: true,
      screen: 'WorkMachines',
      params: { agentId: 'a1', machineRef: 'm1' },
      path: '/work/machines?agentId=a1&machineRef=m1',
    });
    expect(parseWorkRoute('agentrix://work/sessions?agentId=a1&sessionRef=s1&machineRef=m1&instructionRef=i1&actionRef=x1').ok).toBe(true);
    expect(parseWorkRoute('work/approvals?approvalRef=r1&source=push')).toEqual({
      ok: true,
      screen: 'WorkApprovals',
      params: { approvalRef: 'r1', source: 'push' },
      path: '/work/approvals?approvalRef=r1&source=push',
    });
    expect(parseWorkRoute('work/receipts?agentId=a1&actionRef=x1').ok).toBe(true);
    expect(parseWorkRoute('work/handoffs?agentId=a1&handoffRef=h1').ok).toBe(true);
  });

  it('is idempotent: normalising a canonical path returns it unchanged', () => {
    for (const input of ['work', 'work/machines?agentId=a1&machineRef=m1', 'work/approvals?approvalRef=r1&source=internal']) {
      const once = normalizeWorkRoutePath(input);
      expect(normalizeWorkRoutePath(once)).toBe(once);
    }
  });

  it.each([
    ['unknown face', 'work/settings', 'unknown_route'],
    ['too deep', 'work/machines/m1', 'unknown_route'],
    ['unknown query key', 'work/machines?agentId=a1&limit=10', 'invalid_query'],
    ['duplicate key', 'work/machines?agentId=a1&agentId=a2', 'invalid_query'],
    ['bad fixture value', 'work?fixture=true', 'invalid_query'],
    ['bad source value', 'work/approvals?source=email', 'invalid_query'],
    ['unsafe ref', 'work/machines?agentId=a1&machineRef=../../etc', 'invalid_identifier'],
    ['absolute path as ref', 'work/handoffs?agentId=a1&handoffRef=C:%5Ctmp', 'invalid_identifier'],
    ['agent-scoped face without agentId', 'work/receipts?actionRef=x1', 'invalid_identifier'],
    ['secret-looking key', 'work/sessions?agentId=a1&token=abc', 'unsafe_parameter'],
    ['local path key', 'work/sessions?agentId=a1&file_path=x', 'unsafe_parameter'],
    ['fragment', 'work/machines?agentId=a1#x', 'malformed_url'],
  ])('lands %s on destination-error instead of a guessed screen', (_label, input, code) => {
    expect(parseWorkRoute(input)).toEqual({ ok: false, code });
    expect(normalizeWorkRoutePath(input)).toBe(`/destination-error?reason=${code}`);
  });

  it('accepts exactly the refs the DRW open-route validator accepts', () => {
    for (const ref of ['a1', 'agent_1', 'm.1~x', 'A'.repeat(128)]) {
      const mine = parseWorkRoute(`work/machines?agentId=a1&machineRef=${encodeURIComponent(ref)}`).ok;
      const drw = parseDeveloperWorkspaceOpenRoute({ agentId: 'a1', machineRef: ref }).ok;
      expect({ ref, accepted: mine }).toEqual({ ref, accepted: drw });
      expect(mine).toBe(true);
    }
    for (const ref of ['', '-lead', 'A'.repeat(129), 'sp ace', '/abs']) {
      const mine = parseWorkRoute(`work/machines?agentId=a1&machineRef=${encodeURIComponent(ref)}`).ok;
      const drw = parseDeveloperWorkspaceOpenRoute({ agentId: 'a1', machineRef: ref }).ok;
      expect({ ref, accepted: mine }).toEqual({ ref, accepted: drw });
      expect(mine).toBe(false);
    }
  });

  it('is the guard resolveIncomingPath runs before the legacy hop, and the linking config uses the same paths', () => {
    const linking = readFileSync(resolve(__dirname, '../../app/linking.ts'), 'utf8');
    expect(linking).toContain('if (isWorkRoutePath(path)) return normalizeWorkRoutePath(path);');
    const guardAt = linking.indexOf('isWorkRoutePath(path)');
    const legacyHopAt = linking.indexOf('resolveLegacyFamilyPath(resolveLegacyPath(path)');
    expect(guardAt).toBeGreaterThan(0);
    expect(guardAt).toBeLessThan(legacyHopAt);
    for (const screen of Object.keys(WORK_ROUTE_PATHS)) {
      expect(linking).toContain(`${screen}: WORK_ROUTE_PATHS.${screen}`);
    }
  });
});
