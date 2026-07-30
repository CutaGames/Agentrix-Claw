import {
  MOBILE_V7_ROUTE_SCHEMA_VERSION,
  isMobileV7RouteCandidate,
  normalizeMobileV7Route,
  parseMobileV7Route,
  serializeMobileV7Route,
} from '../v7/routeContract';

describe('Mobile V7 route contract', () => {
  it('round-trips an Agent-scoped Action handoff with receipt view', () => {
    const parsed = parseMobileV7Route(
      'agentrix://agents/agent-01/actions/action-99?view=receipt&v=7',
    );
    expect(parsed).toEqual({
      ok: true,
      destination: {
        schemaVersion: MOBILE_V7_ROUTE_SCHEMA_VERSION,
        route: 'ActionDetail',
        params: {
          agentId: 'agent-01',
          actionId: 'action-99',
          view: 'receipt',
        },
      },
    });
    if (parsed.ok) {
      expect(serializeMobileV7Route(parsed.destination)).toBe(
        '/agents/agent-01/actions/action-99?view=receipt',
      );
    }
  });

  it('keeps Agent, Action, Creation, My-adjacent secondary routes explicit', () => {
    expect(parseMobileV7Route('/agents').ok).toBe(true);
    expect(parseMobileV7Route('/actions?agentId=agent-01').ok).toBe(true);
    expect(parseMobileV7Route('/creation?mode=world').ok).toBe(true);
    expect(parseMobileV7Route('/prediction').ok).toBe(true);
    expect(parseMobileV7Route('/lsm').ok).toBe(true);
  });

  it('requires Agent context for goal, compare, authority and Soul Card flows', () => {
    expect(parseMobileV7Route('/actions/new')).toEqual(expect.objectContaining({
      ok: false,
      error: expect.objectContaining({ code: 'invalid_identifier' }),
    }));
    expect(parseMobileV7Route('/actions/compare?agentId=agent-01')).toEqual(expect.objectContaining({
      ok: false,
      error: expect.objectContaining({ code: 'invalid_identifier' }),
    }));
    expect(parseMobileV7Route('/actions/action-1/authority')).toEqual(expect.objectContaining({
      ok: false,
      error: expect.objectContaining({ code: 'invalid_identifier' }),
    }));
    expect(parseMobileV7Route('/my/soul-card?step=tap')).toEqual(expect.objectContaining({
      ok: false,
      error: expect.objectContaining({ code: 'invalid_identifier' }),
    }));
  });

  it('normalizes an optional hardware route without claiming hardware presence', () => {
    const normalized = normalizeMobileV7Route(
      '/my/soul-card?agentId=agent-01&step=capability&v=7',
    );
    expect(normalized).toEqual(expect.objectContaining({
      ok: true,
      path: '/my/soul-card?agentId=agent-01&step=capability',
    }));
  });

  it('recognizes V7 paths before origin validation so invalid inbound links fail closed', () => {
    expect(isMobileV7RouteCandidate('agentrix://agents/agent-01')).toBe(true);
    expect(isMobileV7RouteCandidate('https://evil.example/agents/agent-01')).toBe(true);
    expect(isMobileV7RouteCandidate('/auth/callback')).toBe(false);
  });

  it('rejects caller-supplied Soul Core scope on an Agent action route', () => {
    expect(parseMobileV7Route(
      '/agents/agent-01/actions/action-99?soulCoreId=sc_other',
    )).toEqual(expect.objectContaining({
      ok: false,
      error: expect.objectContaining({ code: 'invalid_query' }),
    }));
  });

  it('rejects duplicate, unsafe, unknown-version and off-origin input', () => {
    expect(parseMobileV7Route('/actions?agentId=a&agentId=b').ok).toBe(false);
    expect(parseMobileV7Route('/agents/../secret').ok).toBe(false);
    expect(parseMobileV7Route('/agents?v=6')).toEqual(expect.objectContaining({
      ok: false,
      error: expect.objectContaining({ code: 'unsupported_version' }),
    }));
    expect(parseMobileV7Route('https://evil.example/agents').ok).toBe(false);
  });
});
