/**
 * Agentrix Shared Types — barrel.
 * 跨端唯一类型源入口。
 *
 * 2026-05-10 fix: `pet.ts` 保留了一个旧版本的 `PET_PRESENCE_TOPICS`
 * (2 keys)，而 `pet-presence.ts` 是 canonical 版 (10 keys, camelCase keys)。
 * 使用显式 re-export 让 canonical 版本覆盖，同时保留 `pet.ts` 其它类型。
 */
export * from './agentrix-presence';

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
