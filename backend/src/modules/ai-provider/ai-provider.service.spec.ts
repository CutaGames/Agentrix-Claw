import { AiProviderService } from './ai-provider.service';

/**
 * Guards the Claude Opus 4.7 feature (shipped build142).
 * Ensures the new model is present in the correct provider catalogs + aliases.
 */
describe('AiProviderService — Claude Opus 4.7 catalog coverage', () => {
  let service: AiProviderService;

  beforeAll(() => {
    const stubConfig = { get: (_: string) => 'unit-test-key' } as any;
    // Repo + Bedrock deps are not touched by getCatalog / resolveModelCapability
    service = new AiProviderService(null as any, stubConfig, null as any);
  });

  it('getCatalog() exposes Bedrock (international) Opus 4.7 model', () => {
    const bedrock = service.getCatalog().find((p) => p.id === 'bedrock');
    expect(bedrock).toBeDefined();
    const opus47 = bedrock!.models.find((m) =>
      m.id.includes('claude-opus-4-7-20260401'),
    );
    expect(opus47).toBeDefined();
    expect(opus47!.multimodal).toBe(true);
    expect(opus47!.contextWindow).toBeGreaterThanOrEqual(200_000);
  });

  it('getCatalog() exposes Anthropic direct Opus 4.7 model', () => {
    const anthropic = service.getCatalog().find((p) => p.id === 'anthropic');
    expect(anthropic).toBeDefined();
    const opus47 = anthropic!.models.find((m) => m.id === 'claude-opus-4-7-20260401');
    expect(opus47).toBeDefined();
    expect(opus47!.multimodal).toBe(true);
  });

  it('getCatalog() exposes Copilot subscription Opus 4.7 with 3x multiplier', () => {
    const copilot = service.getCatalog().find((p) => p.id === 'copilot-subscription');
    expect(copilot).toBeDefined();
    const opus47 = copilot!.models.find((m) => m.id === 'copilot-sub-claude-opus-4.7');
    expect(opus47).toBeDefined();
    expect(opus47!.premiumMultiplier).toBe(3);
  });

  it('resolveModelCapability() recognizes platform alias claude-opus-4-7 as multimodal', () => {
    const resolved = service.resolveModelCapability('claude-opus-4-7');
    expect(resolved.multimodal).toBe(true);
    expect(resolved.providerId).toBe('platform');
  });

  it('resolveModelCapability() maps copilot-sub-claude-opus-4.7 subscription alias', () => {
    const resolved = service.resolveModelCapability(
      'copilot-sub-claude-opus-4.7',
      'copilot-subscription',
    );
    expect(resolved.model).toBeDefined();
    expect(resolved.model!.id).toBe('copilot-sub-claude-opus-4.7');
  });

  it('getCatalog() exposes GPT-5.5 for OpenAI API and subscription providers', () => {
    const catalog = service.getCatalog();

    const openai = catalog.find((p) => p.id === 'openai');
    expect(openai?.models.find((m) => m.id === 'gpt-5.5')).toMatchObject({
      multimodal: true,
      contextWindow: 1_000_000,
    });

    const chatgpt = catalog.find((p) => p.id === 'chatgpt-subscription');
    expect(chatgpt?.models.find((m) => m.id === 'chatgpt-sub-gpt-5.5')).toBeDefined();

    const copilot = catalog.find((p) => p.id === 'copilot-subscription');
    expect(copilot?.models.find((m) => m.id === 'copilot-sub-gpt-5.5')).toMatchObject({
      multimodal: true,
      premiumMultiplier: 1,
    });
  });

  it('resolveExecutionModelId() maps GPT-5.5 subscription aliases to execution IDs', () => {
    expect(service.resolveExecutionModelId('chatgpt-sub-gpt-5.5')).toBe('gpt-5.5');
    expect(service.resolveExecutionModelId('copilot-sub-gpt-5.5')).toBe('gpt-5.5');
  });
});
