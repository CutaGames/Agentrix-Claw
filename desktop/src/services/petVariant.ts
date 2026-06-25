/**
 * Pet Variant resolver — Sprint P-7 phase 3-5 (2026-05-22).
 *
 * Resolves which sprite folder to render based on:
 *
 *   1. Active wardrobe skin (e.g. `kitsune-academy`, `kitsune-ninja`)
 *   2. Active clan (`A_office`, `B_creator`, `C_maker`)
 *   3. Active festival decoration (`spring`, `christmas`, `lunar-new-year`)
 *
 * Asset discovery chain (first match wins):
 *
 *   /pets/sprites/<clan>/<skin>/<festival>/<action>.png
 *   /pets/sprites/<clan>/<skin>/<action>.png
 *   /pets/sprites/<clan>/<festival>/<action>.png
 *   /pets/sprites/<clan>/<action>.png
 *   /pets/sprites/<skin>/<festival>/<action>.png
 *   /pets/sprites/<skin>/<action>.png
 *   /pets/sprites/default/<festival>/<action>.png
 *   /pets/sprites/default/<action>.png
 *
 * Today only the `default/<action>.png` tier is shipped. Adding a new
 * skin / festival / clan = adding the right folder + reusing the
 * existing PetSpriteCanvas renderer. No code changes needed downstream.
 *
 * The resolver itself is a pure function for testability; the React
 * binding (`usePetVariant`) lives below.
 */

import { useEffect, useState } from "react";

export interface PetVariant {
  clan?: string;
  skin?: string;
  festival?: string;
}

const STORAGE_KEY = "agentrix_pet_variant";

let _current: PetVariant = (() => {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as PetVariant) : {};
  } catch {
    return {};
  }
})();

const _listeners = new Set<(v: PetVariant) => void>();

export function getPetVariant(): PetVariant {
  return _current;
}

export function setPetVariant(next: Partial<PetVariant>): void {
  _current = { ..._current, ...next };
  // Strip undefined entries so JSON serialization stays clean.
  const cleaned: PetVariant = {};
  if (_current.clan) cleaned.clan = _current.clan;
  if (_current.skin) cleaned.skin = _current.skin;
  if (_current.festival) cleaned.festival = _current.festival;
  _current = cleaned;
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(_current));
    }
  } catch {
    /* ignore quota errors */
  }
  _listeners.forEach((cb) => {
    try {
      cb(_current);
    } catch {
      /* ignore */
    }
  });
}

export function subscribePetVariant(cb: (v: PetVariant) => void): () => void {
  _listeners.add(cb);
  return () => {
    _listeners.delete(cb);
  };
}

/**
 * Build the candidate list of sprite URLs to probe in order. Public
 * for tests; the renderer is the only real caller.
 */
export function buildVariantCandidates(action: string, variant: PetVariant): string[] {
  const { clan, skin, festival } = variant;
  const list: string[] = [];

  // Most specific → least specific
  if (clan && skin && festival) list.push(`/pets/sprites/${clan}/${skin}/${festival}/${action}.png`);
  if (clan && skin) list.push(`/pets/sprites/${clan}/${skin}/${action}.png`);
  if (clan && festival) list.push(`/pets/sprites/${clan}/${festival}/${action}.png`);
  if (clan) list.push(`/pets/sprites/${clan}/${action}.png`);
  if (skin && festival) list.push(`/pets/sprites/${skin}/${festival}/${action}.png`);
  if (skin) list.push(`/pets/sprites/${skin}/${action}.png`);
  if (festival) list.push(`/pets/sprites/default/${festival}/${action}.png`);
  list.push(`/pets/sprites/default/${action}.png`);

  return list;
}

/**
 * React hook returning the current variant; re-renders on change.
 */
export function usePetVariant(): PetVariant {
  const [v, setV] = useState(() => getPetVariant());
  useEffect(() => subscribePetVariant(setV), []);
  return v;
}

/** @internal */
export function _internalResetForTests(): void {
  _current = {};
  _listeners.clear();
  try {
    if (typeof localStorage !== "undefined") localStorage.removeItem(STORAGE_KEY);
  } catch { /* ignore */ }
}
