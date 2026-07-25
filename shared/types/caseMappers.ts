/**
 * snake_case ↔ camelCase mappers — single source for cross-end DTO bridging.
 *
 * Backend (NestJS + TypeORM SnakeNamingStrategy) emits/accepts snake_case JSON
 * for entity columns, while frontend zustand/RN/Tauri stores prefer camelCase.
 * Historically each surface wrote ad-hoc transforms (causing field drift like
 * `intimacyXp` vs `intimacy_xp`). This module is the only place the mapping
 * lives.
 *
 * Usage:
 *   import { snakeToCamel, camelToSnake } from '@agentrix/shared/types/caseMappers';
 *   const ui = snakeToCamel<PetStateUI>(server.pet.state);
 *   await api.post('/v1/pet/emotion', camelToSnake(ui));
 *
 * Notes:
 *   - Recursive over arrays & plain objects; leaves Dates / non-plain
 *     instances untouched.
 *   - Keys with leading underscore (`_id`) are preserved as-is.
 *   - Pure (no IO, no globals); safe to import in shared types layer.
 */

type Plain = Record<string, unknown>;

function isPlainObject(v: unknown): v is Plain {
  if (v === null || typeof v !== 'object') return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

export function snakeToCamelKey(key: string): string {
  if (key.startsWith('_')) return key;
  return key.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
}

export function camelToSnakeKey(key: string): string {
  if (key.startsWith('_')) return key;
  return key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

export function snakeToCamel<T = unknown>(value: unknown): T {
  if (Array.isArray(value)) {
    return value.map((v) => snakeToCamel(v)) as unknown as T;
  }
  if (isPlainObject(value)) {
    const out: Plain = {};
    for (const [k, v] of Object.entries(value)) {
      out[snakeToCamelKey(k)] = snakeToCamel(v);
    }
    return out as T;
  }
  return value as T;
}

export function camelToSnake<T = unknown>(value: unknown): T {
  if (Array.isArray(value)) {
    return value.map((v) => camelToSnake(v)) as unknown as T;
  }
  if (isPlainObject(value)) {
    const out: Plain = {};
    for (const [k, v] of Object.entries(value)) {
      out[camelToSnakeKey(k)] = camelToSnake(v);
    }
    return out as T;
  }
  return value as T;
}
