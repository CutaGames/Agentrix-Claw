/**
 * Agentrix Shared Types — barrel.
 * 跨端唯一类型源入口。
 *
 * 2026-05-10 fix: `pet.ts` 保留了一个旧版本的 `PET_PRESENCE_TOPICS`
 * (2 keys)，而 `pet-presence.ts` 是 canonical 版 (10 keys, camelCase keys)。
 * 使用显式 re-export 让 canonical 版本覆盖，同时保留 `pet.ts` 其它类型。
 */
export * from './agentrix-presence';
export * from './authority';
export * from './soul-core';
export * from './soul-core-aggregate';
export * from './task-proof';
export * from './action-runtime';
export * from './backend-core-telemetry';
export * from './release-provenance';
export * from './soul-shell';
export * from './telemetry';
export * from './risk-funding';
export * from './soul-core-l1';

// pet.ts: export everything EXCEPT the duplicates covered by pet-presence.ts
export type {
  // 如需新增从 pet.ts 独有的导出，可在此处追加
} from './pet';
export {
  // intentionally empty — the duplicates `PET_PRESENCE_TOPICS` / `PetPresenceTopic`
  // are sourced from `pet-presence.ts` only.
} from './pet';

// Canonical exports for the richer pet-presence schema
export * from './pet-presence';
export * from './pet-skin-variant';
export * from './tier-routing';
export * from './computer-use';
export * from './world-engine';
export * from './world-engine-api';
// Sprint Post-launch P-3 (2026-05-24) — IdeBridge two-way protocol.
// See docs/agentrix-positioning-2026-05.zh-CN.md §7 P3.
export * from './ide-bridge';
export * from './agent-economy';
export * from './agent-economy-fixtures';