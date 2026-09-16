import {
  normalizeActionReceiptDispositionsV1,
  validateActionReceiptV1,
  validateExecutionMandateV1,
  validateGoalIntentV1,
  type ActionReceiptV1,
} from '../agent-economy';
import {
  AGENT_ECONOMY_C0_CONFORMANCE_FIXTURES,
  AGENT_ECONOMY_C0_CONFORMANCE_REFS,
  C0_CONFORMANCE_ACTION_RECEIPT_FIXTURE,
  C0_CONFORMANCE_MANDATE_FIXTURE,
  createAgentEconomyC0Journey,
  createC0ConformanceGoalFixture,
  transitionAgentEconomyC0Journey,
  type AgentEconomyC0JourneyEvent,
  type AgentEconomyC0JourneyState,
} from '../agent-economy-fixtures';
import {
  canonicalizeJson,
  sha256Hex,
  type SignedIntegrity,
} from '../trust-loop-primitives';

function expectFullPayloadIntegrity(payload: { integrity: SignedIntegrity }): void {
  const { integrity, ...unsigned } = payload;
  expect(integrity.payloadDigest.value).toBe(
    sha256Hex(new TextEncoder().encode(canonicalizeJson(unsigned))),
  );
}

function advance(events: AgentEconomyC0JourneyEvent[]): AgentEconomyC0JourneyState {
  return events.reduce(
    transitionAgentEconomyC0Journey,
    createAgentEconomyC0Journey(),
  );
}

const TO_APPROVED: AgentEconomyC0JourneyEvent[] = [
  { type: 'submit-goal', summary: 'Translate the release note' },
  { type: 'compare' },
  { type: 'approve' },
];

describe('Agent Economy shared non-paid C0 conformance family', () => {
  test('freezes exactly one Provider plus one Creation on the same canonical refs', () => {
    const { candidates, plan, quote, mandate } = AGENT_ECONOMY_C0_CONFORMANCE_FIXTURES;

    expect(candidates).toHaveLength(2);
    expect(candidates.map((candidate) => candidate.source.sourceKind)).toEqual([
      'marketplace',
      'creation',
    ]);
    expect(candidates.map((candidate) => candidate.candidateId)).toEqual([
      AGENT_ECONOMY_C0_CONFORMANCE_REFS.providerCandidate.candidateRef,
      AGENT_ECONOMY_C0_CONFORMANCE_REFS.creationCandidate.candidateRef,
    ]);
    expect(candidates.map((candidate) => candidate.source.provenanceRef?.id)).toEqual([
      AGENT_ECONOMY_C0_CONFORMANCE_REFS.providerCandidate.provenanceRef,
      AGENT_ECONOMY_C0_CONFORMANCE_REFS.creationCandidate.provenanceRef,
    ]);
    expect(plan.candidateRefs.map((candidateRef) => candidateRef.id)).toEqual(
      candidates.map((candidate) => candidate.candidateId),
    );
    expect(quote.amount).toEqual({ amountMinor: '0', currency: 'USD', decimals: 2 });
    expect(mandate.budgetCeiling).toEqual(quote.amount);
    expect(mandate.requiredMechanisms).toEqual(['software-policy']);
    expect(mandate.requiredMechanismEvidenceRefs).toHaveLength(1);
    expect(mandate.actualMechanismEvidenceRefs).toHaveLength(1);
  });

  test('emits no reservation, payment, settlement, Remedy, or external verification object', () => {
    const fixtures = AGENT_ECONOMY_C0_CONFORMANCE_FIXTURES as Record<string, unknown>;
    const receipt = C0_CONFORMANCE_ACTION_RECEIPT_FIXTURE;

    expect(fixtures).not.toHaveProperty('reservation');
    expect(fixtures).not.toHaveProperty('paymentAttempt');
    expect(fixtures).not.toHaveProperty('settlement');
    expect(fixtures).not.toHaveProperty('remedy');
    expect(fixtures).not.toHaveProperty('verification');
    expect(receipt).not.toHaveProperty('budgetReservationRef');
    expect(receipt.paymentAttemptRefs).toEqual([]);
    expect(receipt.settlementRefs).toEqual([]);
    expect(receipt.remedyRefs).toEqual([]);
    expect(receipt.verificationRefs).toEqual([]);
    expect(receipt).toMatchObject({
      paymentDisposition: 'not_required',
      settlementDisposition: 'not_required',
      remedyDisposition: 'not_opened',
      status: 'unverifiable',
    });
  });

  test('binds full unsigned payloads and keeps raw Goal text out of GoalIntentV1', () => {
    const rawGoal = 'Private release note translation goal';
    const goal = createC0ConformanceGoalFixture(rawGoal);
    const fixedPayloads = [
      AGENT_ECONOMY_C0_CONFORMANCE_FIXTURES.ownership,
      ...AGENT_ECONOMY_C0_CONFORMANCE_FIXTURES.candidates,
      AGENT_ECONOMY_C0_CONFORMANCE_FIXTURES.plan,
      AGENT_ECONOMY_C0_CONFORMANCE_FIXTURES.quote,
      AGENT_ECONOMY_C0_CONFORMANCE_FIXTURES.mandate,
      AGENT_ECONOMY_C0_CONFORMANCE_FIXTURES.attributionLineage,
      AGENT_ECONOMY_C0_CONFORMANCE_FIXTURES.responsibilityLineage,
      AGENT_ECONOMY_C0_CONFORMANCE_FIXTURES.actionReceipt,
      AGENT_ECONOMY_C0_CONFORMANCE_FIXTURES.contextualReputation,
    ];

    expect(JSON.stringify(goal)).not.toContain(rawGoal);
    expect(goal.presentation).toEqual({
      presentationRef: expect.objectContaining({
        id: AGENT_ECONOMY_C0_CONFORMANCE_REFS.goalPresentationRef,
      }),
      disclosure: 'safe_summary',
      audience: 'owner_only',
    });
    expectFullPayloadIntegrity(goal);
    fixedPayloads.forEach(expectFullPayloadIntegrity);
  });

  test('keeps receipt and responsibility lineage on the same Goal, Mandate, Action and refs', () => {
    const { actionReceipt, responsibilityLineage, attributionLineage } =
      AGENT_ECONOMY_C0_CONFORMANCE_FIXTURES;

    expect(actionReceipt.actionId).toBe(AGENT_ECONOMY_C0_CONFORMANCE_REFS.actionId);
    expect(actionReceipt.goalRef.id).toBe(AGENT_ECONOMY_C0_CONFORMANCE_REFS.goalId);
    expect(actionReceipt.mandateRef.id).toBe(AGENT_ECONOMY_C0_CONFORMANCE_REFS.mandateRef);
    expect(actionReceipt.responsibilityLineageRef.id).toBe(
      responsibilityLineage.responsibilityLineageId,
    );
    expect(responsibilityLineage.actionId).toBe(actionReceipt.actionId);
    expect(responsibilityLineage.attributionLineageRef.id).toBe(
      attributionLineage.attributionLineageId,
    );
    expect(responsibilityLineage.sourceRefs.map((sourceRef) => sourceRef.id)).toEqual(
      expect.arrayContaining([
        AGENT_ECONOMY_C0_CONFORMANCE_REFS.goalId,
        AGENT_ECONOMY_C0_CONFORMANCE_REFS.planId,
        AGENT_ECONOMY_C0_CONFORMANCE_REFS.mandateRef,
      ]),
    );
  });
});

describe('Agent Economy additive validators and honest dispositions', () => {
  test('accepts shared Goal, Mandate and Receipt and normalizes legacy absence to unknown', () => {
    expect(validateGoalIntentV1(createC0ConformanceGoalFixture('Translate')).valid).toBe(true);
    expect(validateExecutionMandateV1(C0_CONFORMANCE_MANDATE_FIXTURE).valid).toBe(true);
    expect(validateActionReceiptV1(C0_CONFORMANCE_ACTION_RECEIPT_FIXTURE).valid).toBe(true);
    expect(normalizeActionReceiptDispositionsV1({})).toEqual({
      paymentDisposition: 'unknown',
      settlementDisposition: 'unknown',
      remedyDisposition: 'unknown',
    });
  });

  test.each(['unknown', 'unavailable', 'not_loaded'] as const)(
    'accepts empty refs for honest %s availability states',
    (disposition) => {
      const receipt: ActionReceiptV1 = {
        ...C0_CONFORMANCE_ACTION_RECEIPT_FIXTURE,
        paymentDisposition: disposition,
        settlementDisposition: disposition,
        remedyDisposition: disposition,
      };
      expect(validateActionReceiptV1(receipt)).toEqual({ valid: true, errors: [] });
    },
  );

  test('rejects completed dispositions without refs and invalid mechanism declarations', () => {
    expect(validateActionReceiptV1({
      ...C0_CONFORMANCE_ACTION_RECEIPT_FIXTURE,
      paymentDisposition: 'completed',
      settlementDisposition: 'completed',
      remedyDisposition: 'completed',
    }).errors).toEqual(expect.arrayContaining([
      expect.stringContaining('completed requires paymentAttemptRefs'),
      expect.stringContaining('completed requires settlementRefs'),
      expect.stringContaining('completed requires remedyRefs'),
    ]));

    expect(validateExecutionMandateV1({
      ...C0_CONFORMANCE_MANDATE_FIXTURE,
      requiredMechanisms: [],
    }).valid).toBe(false);
    expect(validateExecutionMandateV1({
      ...C0_CONFORMANCE_MANDATE_FIXTURE,
      requiredMechanisms: ['software-policy', 'software-policy'],
    }).valid).toBe(false);
    expect(validateExecutionMandateV1({
      ...C0_CONFORMANCE_MANDATE_FIXTURE,
      actualMechanismEvidenceRefs: [],
    }).valid).toBe(false);
  });
});

describe('Agent Economy shared pure journey state machine', () => {
  test.each([
    [{ type: 'revoke' } as const, 'revoked'],
    [{ type: 'expire' } as const, 'expired'],
  ])('blocks %s before a new side effect and records terminal authority', (event, status) => {
    const terminal = transitionAgentEconomyC0Journey(advance(TO_APPROVED), event);
    const mandates = terminal.transports
      .filter((transport) => transport.contractName === 'ExecutionMandateV1')
      .map((transport) => (transport.payload as { status: string }).status);

    expect(terminal.phase).toBe('blocked');
    expect(terminal.executionStatus).toBe('blocked');
    expect(mandates).toEqual(['active', status]);
  });

  test('suppresses duplicate submission without appending canonical transports', () => {
    const completed = transitionAgentEconomyC0Journey(advance(TO_APPROVED), { type: 'execute' });
    const duplicate = transitionAgentEconomyC0Journey(completed, { type: 'duplicate-submit' });

    expect(duplicate.duplicateStatus).toBe('suppressed');
    expect(duplicate.transports).toBe(completed.transports);
    expect(duplicate.transports.filter(
      (transport) => transport.contractName === 'ActionReceiptV1',
    )).toHaveLength(1);
  });

  test('keeps timeout unknown, blocks blind replay, then reconciles the original refs', () => {
    const timedOut = transitionAgentEconomyC0Journey(advance(TO_APPROVED), { type: 'timeout' });

    expect(timedOut.phase).toBe('unknown-outcome');
    expect(timedOut.reconciliationStatus).toBe('required');
    expect(transitionAgentEconomyC0Journey(timedOut, { type: 'execute' })).toBe(timedOut);

    const reconciled = transitionAgentEconomyC0Journey(timedOut, { type: 'reconcile' });
    expect(reconciled.phase).toBe('completed');
    expect(reconciled.reconciliationStatus).toBe('reconciled');
    expect(reconciled.transports.filter(
      (transport) => transport.contractName === 'ActionReceiptV1',
    )).toHaveLength(1);
    expect(reconciled.transports.find(
      (transport) => transport.contractName === 'ActionReceiptV1',
    )?.payload).toBe(C0_CONFORMANCE_ACTION_RECEIPT_FIXTURE);
  });
});
