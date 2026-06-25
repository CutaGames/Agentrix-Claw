import { TierResolverService } from './tier-resolver.service';
import { LlmRouterService, TaskTier } from './llm-router.service';

/**
 * Codex-borrow P1 — unit coverage for TierResolverService.
 *
 * The resolver is the bridge between the user-facing 3-tier preference
 * (`local | smart | cloud`) and the existing `LlmRouterService` complexity
 * classifier. We assert four contracts here:
 *
 * 1. `local`  — never calls the classifier and always reports privacyScope=device-only
 * 2. `cloud`  — passes through the requested model id and never calls classifier
 * 3. `smart`  — calls `llmRouter.route()`; remaps catalog id → simple id
 * 4. `smart`  — when classifier throws, returns a safe fallback decision
 */

function makeRouterStub(returnValue: any, throwInstead?: Error) {
  return {
    route: jest.fn(() => {
      if (throwInstead) throw throwInstead;
      return returnValue;
    }),
  } as unknown as LlmRouterService;
}

describe('TierResolverService', () => {
  it('local: returns device-only decision and never classifies', () => {
    const router = makeRouterStub(null);
    const svc = new TierResolverService(router);
    const decision = svc.resolve({
      tier: 'local',
      promptText: 'hi',
      requestedModel: 'gemma-nano-2b',
    });

    expect(decision.requestedTier).toBe('local');
    expect(decision.classifiedTier).toBe('local');
    expect(decision.chosenModel).toBe('gemma-nano-2b');
    expect(decision.privacyScope).toBe('device-only');
    expect(decision.estimatedCostUsd).toBe(0);
    expect((router as any).route).not.toHaveBeenCalled();
  });

  it('cloud: keeps user model id, marks privacyScope=network, never classifies', () => {
    const router = makeRouterStub(null);
    const svc = new TierResolverService(router);
    const decision = svc.resolve({
      tier: 'cloud',
      promptText: 'analyse this',
      requestedModel: 'claude-opus-4-7',
    });

    expect(decision.requestedTier).toBe('cloud');
    expect(decision.chosenModel).toBe('claude-opus-4-7');
    expect(decision.privacyScope).toBe('network');
    expect((router as any).route).not.toHaveBeenCalled();
  });

  it('smart: invokes classifier and remaps catalog id to simple id', () => {
    const router = makeRouterStub({
      tier: TaskTier.LIGHT,
      model: { id: 'anthropic.claude-haiku-4-5-v1:0' },
      reason: 'short prompt',
    });
    const svc = new TierResolverService(router);
    const decision = svc.resolve({
      tier: 'smart',
      promptText: 'hello world',
      requestedModel: 'claude-opus-4-7',
    });

    expect((router as any).route).toHaveBeenCalledWith('hello world', undefined);
    expect(decision.chosenModel).toBe('claude-haiku-4-5');
    expect(decision.classifiedTier).toBe(TaskTier.LIGHT);
    expect(decision.privacyScope).toBe('network');
    expect(decision.estimatedLatencyMs).toBeGreaterThan(0);
  });

  it('smart with LOCAL classification: marks privacyScope=device-only', () => {
    const router = makeRouterStub({
      tier: TaskTier.LOCAL,
      model: { id: 'gemma-nano-2b' },
      reason: 'trivial',
    });
    const svc = new TierResolverService(router);
    const decision = svc.resolve({
      tier: 'smart',
      promptText: 'hi',
    });
    expect(decision.privacyScope).toBe('device-only');
  });

  it('smart: classifier throws → returns safe fallback decision', () => {
    const router = makeRouterStub(null, new Error('boom'));
    const svc = new TierResolverService(router);
    const decision = svc.resolve({
      tier: 'smart',
      promptText: 'hi',
      requestedModel: 'claude-sonnet-4-6',
    });

    expect(decision.requestedTier).toBe('smart');
    expect(decision.chosenModel).toBe('claude-sonnet-4-6');
    expect(decision.reason).toContain('classifier_error_fallback');
    expect(decision.privacyScope).toBe('network');
  });
});
