/**
 * Machine Economy PoC v1 — Software Reference Device only.
 *
 * This is not a production Machine Economy. A Machine is never a second Agent.
 * Possession of a pair ticket or device is not ownership. Hardware evidence
 * must not auto-boost behavioral reputation. Device acks are not Action Receipts.
 */

export const MACHINE_ECONOMY_POC_SCHEMA_VERSION = 1 as const;
export const MACHINE_KIND_SOFTWARE_REFERENCE_DEVICE = 'software_reference_device' as const;

export const MACHINE_POC_STATUSES = ['paired', 'revoked'] as const;
export type MachinePocStatusV1 = (typeof MACHINE_POC_STATUSES)[number];

export interface MachineIdentityRefV1 {
  schemaVersion: typeof MACHINE_ECONOMY_POC_SCHEMA_VERSION;
  machineId: string;
  kind: typeof MACHINE_KIND_SOFTWARE_REFERENCE_DEVICE;
}

export interface MachineCapabilityManifestV1 {
  schemaVersion: typeof MACHINE_ECONOMY_POC_SCHEMA_VERSION;
  computerUseScreen: 'declared';
  computerUseInput: 'declared';
  executable: boolean;
  boundedTaskTypes: readonly ['health_probe'];
}

export const MACHINE_POC_TASK_TYPES = ['health_probe'] as const;
export type MachinePocTaskTypeV1 = (typeof MACHINE_POC_TASK_TYPES)[number];

export interface MachineOfferingProjectionV1 {
  schemaVersion: typeof MACHINE_ECONOMY_POC_SCHEMA_VERSION;
  machineId: string;
  executionState: 'available' | 'unavailable';
  reasonCode:
    | 'software_reference_health_probe'
    | 'machine_revoked'
    | 'machine_not_paired';
}

export interface MachineTaskReceiptV1 {
  schemaVersion: typeof MACHINE_ECONOMY_POC_SCHEMA_VERSION;
  taskId: string;
  machineId: string;
  taskType: MachinePocTaskTypeV1;
  status: 'succeeded' | 'rejected';
  possessionIsNotOwnership: true;
  isActionReceipt: false;
  observedAt: string;
}
