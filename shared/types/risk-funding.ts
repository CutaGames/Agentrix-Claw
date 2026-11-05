export const RISK_FUNDING_SCHEMA_VERSION = 1 as const;

export type RiskBusinessV1 = 'prediction' | 'lsm';
export type RiskFundingAccountV1 = 'main-vault' | 'prediction-ledger' | 'lsm-ledger';

/** Decimal integer in the currency's smallest unit. Never use JS number for money. */
export type MinorUnitAmountV1 = string;

export type RiskFundingTransferStatusV1 =
  | 'requested'
  | 'source-debited'
  | 'destination-credited'
  | 'completed'
  | 'compensation-required'
  | 'compensating'
  | 'compensated'
  | 'reconciliation-required'
  | 'failed';

export type RiskFundingFailureCodeV1 =
  | 'kill-switch-active'
  | 'invalid-route'
  | 'invalid-amount'
  | 'insufficient-source-balance'
  | 'source-command-failed'
  | 'destination-command-failed'
  | 'compensation-failed'
  | 'reconciliation-mismatch'
  | 'duplicate-conflict'
  | 'unknown';

export interface RiskFundingTransferCommandV1 {
  schemaVersion: typeof RISK_FUNDING_SCHEMA_VERSION;
  transferId: string;
  idempotencyKey: string;
  business: RiskBusinessV1;
  source: RiskFundingAccountV1;
  destination: RiskFundingAccountV1;
  currency: string;
  amountMinor: MinorUnitAmountV1;
  requestedAt: string;
  requestedBy: string;
  reason: string;
  correlationId?: string;
}

export interface RiskFundingJournalEntryV1 {
  schemaVersion: typeof RISK_FUNDING_SCHEMA_VERSION;
  journalEntryId: string;
  transferId: string;
  idempotencyKey: string;
  sequence: number;
  fromStatus: RiskFundingTransferStatusV1 | null;
  toStatus: RiskFundingTransferStatusV1;
  occurredAt: string;
  actor: string;
  sourceLedgerRef?: string;
  destinationLedgerRef?: string;
  compensationLedgerRef?: string;
  failureCode?: RiskFundingFailureCodeV1;
  detail?: string;
}

export interface RiskFundingTransferV1 {
  command: RiskFundingTransferCommandV1;
  status: RiskFundingTransferStatusV1;
  journal: RiskFundingJournalEntryV1[];
  updatedAt: string;
}

export interface RiskFundingKillSwitchV1 {
  business: RiskBusinessV1;
  mode: 'normal' | 'block-new-transfers' | 'halt-all';
  version: number;
  reason: string;
  changedAt: string;
  changedBy: string;
}

export interface RiskFundingReconciliationV1 {
  transferId: string;
  checkedAt: string;
  sourceLedgerRef?: string;
  destinationLedgerRef?: string;
  sourceAmountMinor: MinorUnitAmountV1 | null;
  destinationAmountMinor: MinorUnitAmountV1 | null;
  result: 'matched' | 'mismatch' | 'incomplete';
  detail?: string;
}

/**
 * Target boundary only. Implementations must journal every transition and use
 * independent idempotent ledger commands on both sides. This interface does
 * not authorize or execute real-money movement by itself.
 */
export interface RiskFundingTransferPortV1 {
  request(command: RiskFundingTransferCommandV1): Promise<RiskFundingTransferV1>;
  get(transferId: string): Promise<RiskFundingTransferV1 | null>;
  reconcile(transferId: string): Promise<RiskFundingReconciliationV1>;
  getKillSwitch(business: RiskBusinessV1): Promise<RiskFundingKillSwitchV1>;
}
