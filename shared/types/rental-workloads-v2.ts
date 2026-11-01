/**
 * Cross-owner rental, step 2, v0 contract only (L6-9): the workload whitelist grows from local inference to
 * transcoding and rendering (roadmap 3.5). Running them needs per-task virtual machines (E100), so nothing reads this
 * in v0. A job may run only when its kind is whitelisted, it fits the kind's caps and all seven gates are passed.
 */

/** Future server switch; nothing reads it in v0. */
export const RENTAL_WORKLOADS_V2_FLAG = 'RENTAL_WORKLOADS_V2_ENABLED';

export const RENTAL_WORKLOAD_KINDS_V2 = ['local_inference', 'transcode', 'render'] as const;
export type RentalWorkloadKindV2 = (typeof RENTAL_WORKLOAD_KINDS_V2)[number];

export interface RentalWorkloadCapsV2 {
  maxMinutes: number;
  maxCpuCores: number;
  maxMemoryMb: number;
  maxOutputMb: number;
}

export const RENTAL_WORKLOAD_CAPS_V2: Readonly<Record<RentalWorkloadKindV2, RentalWorkloadCapsV2>> = {
  local_inference: { maxMinutes: 30, maxCpuCores: 4, maxMemoryMb: 8192, maxOutputMb: 50 },
  transcode: { maxMinutes: 60, maxCpuCores: 4, maxMemoryMb: 4096, maxOutputMb: 4096 },
  render: { maxMinutes: 120, maxCpuCores: 8, maxMemoryMb: 16384, maxOutputMb: 8192 },
};

/** The seven gates, re-checked for the new kinds. */
export const RENTAL_GATES_V2 = [
  'owner_opt_in',
  'device_attested',
  'workload_whitelisted',
  'sandboxed_vm',
  'metered',
  'settlement_ready',
  'abuse_monitoring',
] as const;
export type RentalGateV2 = (typeof RENTAL_GATES_V2)[number];

export interface RentalJobRequestV2 {
  kind: RentalWorkloadKindV2;
  minutes: number;
  cpuCores: number;
  memoryMb: number;
  outputMb: number;
}

export function rentalJobFitsCapsV2(job: RentalJobRequestV2): boolean {
  const caps = RENTAL_WORKLOAD_CAPS_V2[job.kind];
  return job.minutes <= caps.maxMinutes && job.cpuCores <= caps.maxCpuCores && job.memoryMb <= caps.maxMemoryMb && job.outputMb <= caps.maxOutputMb;
}

/** True only when the job fits and every one of the seven gates is in `passed`. */
export function rentalJobAllowedV2(job: RentalJobRequestV2, passed: ReadonlySet<RentalGateV2>): boolean {
  return rentalJobFitsCapsV2(job) && RENTAL_GATES_V2.every((gate) => passed.has(gate));
}

export function decodeRentalJobRequestV2(value: unknown): RentalJobRequestV2 | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const kind = raw.kind;
  if (typeof kind !== 'string' || !(RENTAL_WORKLOAD_KINDS_V2 as readonly string[]).includes(kind)) return null;
  const nums: number[] = [];
  for (const key of ['minutes', 'cpuCores', 'memoryMb', 'outputMb']) {
    const n = raw[key];
    if (typeof n !== 'number' || !Number.isInteger(n) || n <= 0 || n > 1_000_000) return null;
    nums.push(n);
  }
  return { kind: kind as RentalWorkloadKindV2, minutes: nums[0], cpuCores: nums[1], memoryMb: nums[2], outputMb: nums[3] };
}
