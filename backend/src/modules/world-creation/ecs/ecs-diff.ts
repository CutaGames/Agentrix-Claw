/**
 * ECS_World diff / patch model — self-contained RFC 6902 (JSON Patch) over the
 * canonical ECS_World representation (design §2.3, R3.2 / R3.5 / R4.5 / R9.7).
 *
 * Pure, dependency-free functions:
 *  - {@link diff}        — structural diff producing JSON Patch ops `a → b`.
 *  - {@link applyPatch}  — apply an ordered op list onto an ECS_World.
 *  - {@link applyDiffChain} — replay an incremental diff chain from a base world.
 *
 * Design goals (verified by task 2.6 unit tests):
 *  - `applyPatch(a, diff(a, b))` deep-equals `b` (diff/apply round-trip).
 *  - Incremental diff chains replay deterministically.
 *  - Revert-to-any-version replays correctly.
 *  - Unaffected entities are preserved (a diff only touches what changed).
 *
 * Intentionally self-contained: no third-party dependency, and no import of the
 * parallel `ecs-schema` (task 2.1) or `tier-validator` (task 2.3) modules.
 */

import type { EcsWorld, JsonPatchOp } from '../../../../shared/types/world-creation';

// ============================================================
// JSON value helpers (deep clone / deep equality)
// ============================================================

/** A plain JSON value. */
type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

/** Deep clone a JSON-compatible value (keeps {@link diff}/{@link applyPatch} pure). */
export function deepClone<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    return (value as unknown[]).map((v) => deepClone(v)) as unknown as T;
  }
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>)) {
    out[key] = deepClone((value as Record<string, unknown>)[key]);
  }
  return out as T;
}

/** Structural deep equality for JSON-compatible values. */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return a === b;
  if (typeof a !== 'object' || typeof b !== 'object') return false;

  const aIsArr = Array.isArray(a);
  const bIsArr = Array.isArray(b);
  if (aIsArr !== bIsArr) return false;

  if (aIsArr && bIsArr) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }

  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const aKeys = Object.keys(ao);
  const bKeys = Object.keys(bo);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    if (!Object.prototype.hasOwnProperty.call(bo, key)) return false;
    if (!deepEqual(ao[key], bo[key])) return false;
  }
  return true;
}

// ============================================================
// JSON Pointer (RFC 6901)
// ============================================================

/** Decode a single JSON Pointer reference token (`~1` → `/`, `~0` → `~`). */
function unescapeToken(token: string): string {
  return token.replace(/~1/g, '/').replace(/~0/g, '~');
}

/** Encode a single JSON Pointer reference token (`~` → `~0`, `/` → `~1`). */
function escapeToken(token: string): string {
  return token.replace(/~/g, '~0').replace(/\//g, '~1');
}

/** Split a JSON Pointer path (e.g., `/entities/2/components`) into decoded tokens. */
function parsePointer(path: string): string[] {
  if (path === '') return [];
  if (path[0] !== '/') {
    throw new Error(`Invalid JSON Pointer (must start with "/"): ${path}`);
  }
  return path.substring(1).split('/').map(unescapeToken);
}

/** Build a JSON Pointer path from decoded tokens. */
function buildPointer(tokens: Array<string | number>): string {
  if (tokens.length === 0) return '';
  return '/' + tokens.map((t) => escapeToken(String(t))).join('/');
}

// ============================================================
// applyPatch — RFC 6902 application
// ============================================================

/** Resolve the parent container + final key of a pointer within `root`. */
function resolveParent(
  root: unknown,
  tokens: string[],
): { parent: unknown; key: string } {
  if (tokens.length === 0) {
    throw new Error('Cannot resolve parent of the document root');
  }
  let node: unknown = root;
  for (let i = 0; i < tokens.length - 1; i++) {
    const token = tokens[i];
    if (Array.isArray(node)) {
      node = node[Number(token)];
    } else if (node !== null && typeof node === 'object') {
      node = (node as Record<string, unknown>)[token];
    } else {
      throw new Error(`Path not found while resolving: /${tokens.join('/')}`);
    }
    if (node === undefined) {
      throw new Error(`Path not found: /${tokens.join('/')}`);
    }
  }
  return { parent: node, key: tokens[tokens.length - 1] };
}

/** Read the value at a JSON Pointer path within `root`. */
function getAtPointer(root: unknown, path: string): unknown {
  const tokens = parsePointer(path);
  let node: unknown = root;
  for (const token of tokens) {
    if (Array.isArray(node)) {
      node = node[Number(token)];
    } else if (node !== null && typeof node === 'object') {
      node = (node as Record<string, unknown>)[token];
    } else {
      throw new Error(`Path not found: ${path}`);
    }
  }
  return node;
}

/** Insert/set a value into the parent container resolved from `tokens`. */
function setAtParent(
  parent: unknown,
  key: string,
  value: unknown,
  mode: 'add' | 'replace',
): void {
  if (Array.isArray(parent)) {
    if (key === '-') {
      parent.push(value);
      return;
    }
    const idx = Number(key);
    if (Number.isNaN(idx) || idx < 0 || idx > parent.length) {
      throw new Error(`Array index out of bounds: ${key}`);
    }
    if (mode === 'add') {
      parent.splice(idx, 0, value);
    } else {
      parent[idx] = value;
    }
  } else if (parent !== null && typeof parent === 'object') {
    (parent as Record<string, unknown>)[key] = value;
  } else {
    throw new Error('Cannot set value on a non-container parent');
  }
}

/** Remove a value from the parent container resolved from `tokens`. */
function removeAtParent(parent: unknown, key: string): void {
  if (Array.isArray(parent)) {
    const idx = Number(key);
    if (Number.isNaN(idx) || idx < 0 || idx >= parent.length) {
      throw new Error(`Array index out of bounds for remove: ${key}`);
    }
    parent.splice(idx, 1);
  } else if (parent !== null && typeof parent === 'object') {
    delete (parent as Record<string, unknown>)[key];
  } else {
    throw new Error('Cannot remove value from a non-container parent');
  }
}

/**
 * Apply an ordered list of RFC 6902 operations onto an ECS_World, returning a
 * new ECS_World (the input is never mutated). Operations apply in order.
 *
 * @throws if an op references a missing path or a `test` op fails.
 */
export function applyPatch(world: EcsWorld, ops: JsonPatchOp[]): EcsWorld {
  const root = deepClone(world) as unknown;

  for (const op of ops) {
    const tokens = parsePointer(op.path);

    switch (op.op) {
      case 'add': {
        const { parent, key } = resolveParent(root, tokens);
        setAtParent(parent, key, deepClone(op.value), 'add');
        break;
      }
      case 'replace': {
        const { parent, key } = resolveParent(root, tokens);
        setAtParent(parent, key, deepClone(op.value), 'replace');
        break;
      }
      case 'remove': {
        const { parent, key } = resolveParent(root, tokens);
        removeAtParent(parent, key);
        break;
      }
      case 'move': {
        if (op.from === undefined) {
          throw new Error('move op requires a "from" path');
        }
        const moved = deepClone(getAtPointer(root, op.from));
        const fromTokens = parsePointer(op.from);
        const fromParent = resolveParent(root, fromTokens);
        removeAtParent(fromParent.parent, fromParent.key);
        const { parent, key } = resolveParent(root, tokens);
        setAtParent(parent, key, moved, 'add');
        break;
      }
      case 'copy': {
        if (op.from === undefined) {
          throw new Error('copy op requires a "from" path');
        }
        const copied = deepClone(getAtPointer(root, op.from));
        const { parent, key } = resolveParent(root, tokens);
        setAtParent(parent, key, copied, 'add');
        break;
      }
      case 'test': {
        const actual = getAtPointer(root, op.path);
        if (!deepEqual(actual, op.value)) {
          throw new Error(`test op failed at ${op.path}`);
        }
        break;
      }
      default: {
        throw new Error(`Unsupported JSON Patch op: ${(op as JsonPatchOp).op}`);
      }
    }
  }

  return root as EcsWorld;
}

// ============================================================
// diff — structural JSON Patch generation
// ============================================================

/** Recursively diff `a → b`, appending ops to `ops` for the given pointer tokens. */
function diffRecursive(
  a: unknown,
  b: unknown,
  tokens: Array<string | number>,
  ops: JsonPatchOp[],
): void {
  if (deepEqual(a, b)) return;

  const aIsArr = Array.isArray(a);
  const bIsArr = Array.isArray(b);
  const aIsObj = a !== null && typeof a === 'object' && !aIsArr;
  const bIsObj = b !== null && typeof b === 'object' && !bIsArr;

  // Type changed or primitive change → replace whole node.
  if (aIsArr !== bIsArr || aIsObj !== bIsObj || (!aIsArr && !aIsObj)) {
    ops.push({ op: 'replace', path: buildPointer(tokens), value: deepClone(b) });
    return;
  }

  if (aIsArr && bIsArr) {
    diffArray(a as unknown[], b as unknown[], tokens, ops);
    return;
  }

  // Both plain objects.
  diffObject(
    a as Record<string, unknown>,
    b as Record<string, unknown>,
    tokens,
    ops,
  );
}

/** Diff two arrays by index. Replaces in place, then removes tail, then appends. */
function diffArray(
  a: unknown[],
  b: unknown[],
  tokens: Array<string | number>,
  ops: JsonPatchOp[],
): void {
  const common = Math.min(a.length, b.length);

  // 1. Recurse over shared indices (emit replaces/nested changes at valid idx).
  for (let i = 0; i < common; i++) {
    diffRecursive(a[i], b[i], [...tokens, i], ops);
  }

  // 2. Remove surplus tail elements from the end (keeps indices valid on apply).
  if (a.length > b.length) {
    for (let i = a.length - 1; i >= b.length; i--) {
      ops.push({ op: 'remove', path: buildPointer([...tokens, i]) });
    }
  }

  // 3. Append new trailing elements in order.
  if (b.length > a.length) {
    for (let i = a.length; i < b.length; i++) {
      ops.push({ op: 'add', path: buildPointer([...tokens, '-']), value: deepClone(b[i]) });
    }
  }
}

/** Diff two plain objects: recurse shared keys, remove dropped keys, add new keys. */
function diffObject(
  a: Record<string, unknown>,
  b: Record<string, unknown>,
  tokens: Array<string | number>,
  ops: JsonPatchOp[],
): void {
  // Removed keys (present in a, absent in b).
  for (const key of Object.keys(a)) {
    if (!Object.prototype.hasOwnProperty.call(b, key)) {
      ops.push({ op: 'remove', path: buildPointer([...tokens, key]) });
    }
  }

  // Shared keys → recurse; new keys → add.
  for (const key of Object.keys(b)) {
    if (Object.prototype.hasOwnProperty.call(a, key)) {
      diffRecursive(a[key], b[key], [...tokens, key], ops);
    } else {
      ops.push({ op: 'add', path: buildPointer([...tokens, key]), value: deepClone(b[key]) });
    }
  }
}

/**
 * Produce an ordered list of RFC 6902 operations transforming ECS_World `a`
 * into ECS_World `b`. The result satisfies the round-trip invariant:
 * `applyPatch(a, diff(a, b))` deep-equals `b`.
 *
 * The diff is structural and minimal-ish: only changed paths emit ops, so
 * unaffected entities/components are preserved untouched.
 */
export function diff(a: EcsWorld, b: EcsWorld): JsonPatchOp[] {
  const ops: JsonPatchOp[] = [];
  diffRecursive(a as unknown, b as unknown, [], ops);
  return ops;
}

// ============================================================
// applyDiffChain — incremental chain replay
// ============================================================

/**
 * Replay an incremental chain of diffs onto a base world in order, returning the
 * resulting ECS_World. Each element supplies its ordered ops (e.g., the
 * `opsJson` column of `ecs_world_diffs`). Used to reconstruct any version by
 * replaying from the nearest snapshot anchor (design §2.3).
 */
export function applyDiffChain(
  base: EcsWorld,
  chain: Array<{ ops: JsonPatchOp[] }>,
): EcsWorld {
  let world = deepClone(base);
  for (const link of chain) {
    world = applyPatch(world, link.ops);
  }
  return world;
}
