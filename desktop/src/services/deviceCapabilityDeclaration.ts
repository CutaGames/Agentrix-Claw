/**
 * deviceCapabilityDeclaration — 这台电脑的能力声明（L5 待办 4，合同 `DeviceCapabilityDeclarationV0`）。默认关，不上传。
 *
 * 现在只组装，不签名、不发：签名要等 REQ-backend-096 desktop 第 5 条（摘要怎么规范化）定下来，上传要等服务端接口。
 * 组出来的声明一定能过合同的 `decodeDeviceCapabilityDeclarationV0`，组不出来（没绑定、没有 shell 绑定）就返回原因。
 *
 * 只声明一项：`llm.generate.v1`（本地模型推理，E100 ①）。状态按出租规则的判断（`rentalVerdict`）分三种：
 * - `available`：现在能接；
 * - `busy`：规则允许，但暂时不行（不在时段、在用电脑、没接电源、偏热、急停拉着，或者这些读不到）；
 * - `unavailable`：本机没打开、规则文件没核对过、规则没填完整、平台没开放、系统不支持。
 * 上限照受限推理进程的 `Limits`（`rental_inference.rs`），键名按 REQ-backend-096 desktop 第 6 条的建议。
 */
import {
  DEVICE_CAPABILITY_DECLARATION_MAX_TTL_SECONDS,
  DEVICE_CAPABILITY_DECLARATION_SCHEMA_VERSION,
  type DeviceCapabilityDeclarationV0,
  type DeviceCapabilityStateV0,
} from "../../../shared/types/device-capability";
import { RENTAL_CAPABILITY_CATEGORY, RENTAL_CAPABILITY_TYPE, rentalVerdict, type RentalBlocker, type RentalRulesView } from "./rentalRules";

/** Mirrors `rental_inference::Limits::default()`. */
export const RENTAL_INFERENCE_LIMITS = {
  maxPromptBytes: 32 * 1024,
  maxOutputBytes: 256 * 1024,
  maxOutputTokens: 1024,
  maxExecutionMs: 120_000,
  maxCpuMs: 480_000,
  maxConcurrentJobs: 1,
} as const;

const UNAVAILABLE: ReadonlySet<RentalBlocker> = new Set(["off", "not_verified", "rule_invalid", "nothing_open", "unsupported_os"]);

export function rentalCapabilityState(view: RentalRulesView, now: Date, flags: Readonly<Record<string, string | undefined>> = {}): DeviceCapabilityStateV0 {
  const verdict = rentalVerdict(view, now, flags);
  if (verdict.mayRent) return "available";
  return verdict.blockers.some((blocker) => UNAVAILABLE.has(blocker)) ? "unavailable" : "busy";
}

export interface DeclarationInput {
  deviceId: string;
  signerRef: string | null;
  shellBinding: { id: string; version: number } | null;
  declarationId: string;
  rental: RentalRulesView;
  now: Date;
  flags?: Readonly<Record<string, string | undefined>>;
  ttlSeconds?: number;
}

export type DeclarationResult = { ok: true; declaration: DeviceCapabilityDeclarationV0 } | { ok: false; reason: "not_bound" | "no_shell_binding" };

function isoSeconds(date: Date): string {
  return `${date.toISOString().slice(0, 19)}Z`;
}

export function buildCapabilityDeclaration(input: DeclarationInput): DeclarationResult {
  if (!input.signerRef) return { ok: false, reason: "not_bound" };
  if (!input.shellBinding) return { ok: false, reason: "no_shell_binding" };
  const ttl = Math.min(Math.max(input.ttlSeconds ?? DEVICE_CAPABILITY_DECLARATION_MAX_TTL_SECONDS, 60), DEVICE_CAPABILITY_DECLARATION_MAX_TTL_SECONDS);
  const probes = input.rental.probes;
  const observedAt = isoSeconds(input.now);
  const expiresAt = isoSeconds(new Date(Date.parse(observedAt) + ttl * 1000));
  const idleKnown = probes.idleSeconds !== null;
  return {
    ok: true,
    declaration: {
      schemaVersion: DEVICE_CAPABILITY_DECLARATION_SCHEMA_VERSION,
      declarationId: input.declarationId,
      deviceId: input.deviceId,
      kind: "desktop",
      shellBindingRef: { type: "shell_session_binding", id: input.shellBinding.id, version: input.shellBinding.version },
      attestedBy: "device_key",
      signerRef: input.signerRef,
      items: [
        {
          type: RENTAL_CAPABILITY_TYPE,
          category: RENTAL_CAPABILITY_CATEGORY,
          state: rentalCapabilityState(input.rental, input.now, input.flags),
          limits: {
            ...RENTAL_INFERENCE_LIMITS,
            cores: input.rental.coresAllowed,
            maxMemoryMiB: input.rental.memoryGibAllowed * 1024,
          },
        },
      ],
      conditions: {
        onPower: probes.power === "unknown" ? null : probes.power === "ac",
        thermalOk: probes.thermal === "unknown" ? null : probes.thermal === "nominal",
        idle: idleKnown ? (probes.idleSeconds as number) >= input.rental.idleMinutes * 60 : null,
      },
      observedAt,
      expiresAt,
    },
  };
}
