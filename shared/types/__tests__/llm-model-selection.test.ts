import {
  AGENTRIX_POOL_PROVIDER_ID,
  createSelectionIdV1,
  findForbiddenClientModelSelectionFieldsV1,
  parseSelectionIdV1,
  validateClientModelSelectionRequestV1,
  validateCredentialResolutionV1,
  validateLlmGatewayError,
  validateModelSelectionV1,
  type LlmGatewayError,
  type ModelSelection,
} from '../llm-model-selection';

describe('LLM model selection shared contract', () => {
  it('keeps the same upstream model unique across BYO and pool sources', () => {
    const byo = createSelectionIdV1('openai', 'gpt-5.6-terra');
    const pool = createSelectionIdV1(AGENTRIX_POOL_PROVIDER_ID, 'gpt-5.6-terra');

    expect(byo).toBe('openai:gpt-5.6-terra');
    expect(pool).toBe('agentrix-pool:gpt-5.6-terra');
    expect(byo).not.toBe(pool);
    expect(new Set([byo, pool]).size).toBe(2);
  });

  it('splits selectionId on the first colon and rejects duplicate pool namespaces', () => {
    expect(parseSelectionIdV1('agentrix-pool:vendor/model:v2')).toEqual({
      valid: true,
      errors: [],
      value: {
        selectionId: 'agentrix-pool:vendor/model:v2',
        providerId: 'agentrix-pool',
        modelId: 'vendor/model:v2',
        isPool: true,
      },
    });

    expect(parseSelectionIdV1('agentrix-pool:agentrix-pool:gpt-5.6').valid).toBe(false);
    expect(parseSelectionIdV1('openai:agentrix-pool:gpt-5.6').valid).toBe(false);
  });

  it('validates the client selection DTO with exact keys', () => {
    expect(validateClientModelSelectionRequestV1({ selectionId: 'openai:gpt-5.5' })).toEqual({
      valid: true,
      errors: [],
    });
    expect(validateClientModelSelectionRequestV1({
      selectionId: 'openai:gpt-5.5',
      billing: 'byo',
    })).toEqual({
      valid: false,
      errors: ['selection.billing: unknown field'],
    });
  });

  it('finds malicious server-authoritative fields without scanning message content', () => {
    const findings = findForbiddenClientModelSelectionFieldsV1({
      selectionId: 'openai:gpt-5.5',
      credentialSource: 'byo',
      options: { upstreamModelId: 'hidden-model' },
      context: { resolution: { billing: 'byo' } },
      messages: [{ role: 'user', content: { billing: 'quoted user data' } }],
    });

    expect(findings).toEqual([
      'credentialSource: server-authoritative field',
      'options.upstreamModelId: server-authoritative field',
      'context.resolution: server-authoritative field',
    ]);
  });

  it('enforces the canonical pool selection invariants', () => {
    const selection: ModelSelection = {
      selectionId: 'agentrix-pool:gpt-5.6-terra',
      providerId: 'agentrix-pool',
      modelId: 'gpt-5.6-terra',
      upstreamModelId: 'gpt-5.6-terra',
      label: 'GPT-5.6 Terra',
      billingType: 'platform',
      credentialSource: 'pool',
      availability: 'disabled',
      availabilityReason: 'POOL_DISABLED',
      capabilities: ['chat', 'function_calling'],
      contextWindow: 200_000,
      requiresAuth: true,
      catalogVersion: 'pool-catalog:v1',
    };

    expect(validateModelSelectionV1(selection)).toEqual({ valid: true, errors: [] });
    expect(validateModelSelectionV1({ ...selection, billingType: 'api-key' }).valid).toBe(false);
    expect(validateModelSelectionV1({ ...selection, credentialSource: 'byo' }).valid).toBe(false);
  });

  it('rejects a billing/finalSource contradiction in credential resolution', () => {
    expect(validateCredentialResolutionV1({
      selectionId: 'openai:gpt-5.5',
      requestedSource: 'byo',
      resolvedSource: 'byo',
      finalSource: 'platform-env',
      providerId: 'openai',
      upstreamModelId: 'gpt-5.5',
      credentialRef: 'user-provider:v1',
      billing: 'byo',
    }).valid).toBe(false);
  });

  it('serializes a stable safe gateway error without any credential-shaped value', () => {
    const error: LlmGatewayError = {
      error: 'LlmGatewayError',
      code: 'POOL_DISABLED',
      message: 'Agentrix pool dispatch is not enabled.',
      requestId: 'llm_00000000-0000-4000-8000-000000000001',
      retryable: false,
      status: 503,
    };

    expect(validateLlmGatewayError(error)).toEqual({ valid: true, errors: [] });
    expect(error).toMatchInlineSnapshot(`
{
  "code": "POOL_DISABLED",
  "error": "LlmGatewayError",
  "message": "Agentrix pool dispatch is not enabled.",
  "requestId": "llm_00000000-0000-4000-8000-000000000001",
  "retryable": false,
  "status": 503,
}
`);
    expect(JSON.stringify(error)).not.toMatch(/(?:sk-|Bearer\s|gh[opu]_|eyJ[A-Za-z0-9_-]+\.)/i);
  });
});
