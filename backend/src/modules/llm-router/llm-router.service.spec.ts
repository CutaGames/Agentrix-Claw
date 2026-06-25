import { LlmRouterService, TaskTier } from './llm-router.service';

describe('LlmRouterService', () => {
  const svc = new LlmRouterService();

  it('routes trivial greetings to LIGHT or LOCAL tier', () => {
    const result = svc.route('hello');
    expect([TaskTier.LOCAL, TaskTier.LIGHT]).toContain(result.tier);
    expect(result.model).toBeDefined();
    expect(result.model.id).toBeDefined();
  });

  it('routes complex prompts to MEDIUM/HEAVY/ULTRA tier', () => {
    const result = svc.route(
      'Please analyze this codebase and refactor the authentication module to use OAuth2 with PKCE, then write tests',
    );
    expect([TaskTier.MEDIUM, TaskTier.HEAVY, TaskTier.ULTRA]).toContain(result.tier);
  });

  it('listModels returns a non-empty catalog', () => {
    const list = svc.listModels();
    expect(Array.isArray(list)).toBe(true);
    expect(list.length).toBeGreaterThan(5);
    for (const m of list) {
      expect(m.id).toBeTruthy();
      expect(m.name).toBeTruthy();
      expect(typeof m.inputCostPer1M).toBe('number');
    }
  });
});
