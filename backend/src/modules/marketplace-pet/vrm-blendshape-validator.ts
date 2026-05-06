/**
 * VRM blendshape validator — Phase 3 W1 BE-T3.2.
 *
 * Validates a VRM 1.0 / 0.x manifest's `expressions` (or VRMC_vrm.expressions)
 * to ensure the file ships with the 5 mandatory ARKit-style blend shapes:
 *   happy · sad · angry · surprised · neutral
 *
 * The full BE-T3.1 auto-rig pipeline (.glb → .vrm) is deferred to Phase 3 W2
 * (requires external Rust/Python service); this validator runs against the
 * manifest produced by the auto-rigger or by user upload.
 *
 * Pure function — manifest is plain JSON; no I/O.
 */

export type RequiredBlendShape = 'happy' | 'sad' | 'angry' | 'surprised' | 'neutral';

export const REQUIRED_BLEND_SHAPES: readonly RequiredBlendShape[] = [
  'happy', 'sad', 'angry', 'surprised', 'neutral',
] as const;

/**
 * Heuristic alias map — many .vrm exporters use slightly different names.
 * We accept any of these as satisfying the requirement.
 */
const ALIASES: Record<RequiredBlendShape, string[]> = {
  happy: ['happy', 'joy', 'smile', 'fun'],
  sad: ['sad', 'sorrow', 'frown'],
  angry: ['angry', 'anger', 'mad'],
  surprised: ['surprised', 'surprise', 'shock'],
  neutral: ['neutral', 'default', 'rest'],
};

export interface VrmBlendShapeValidationResult {
  valid: boolean;
  missing: RequiredBlendShape[];
  found: Record<RequiredBlendShape, string | null>;
  /** Total expressions enumerated (for telemetry). */
  expressionCount: number;
}

/**
 * Accepts a VRM manifest as parsed JSON (we don't parse glTF chunks here —
 * upstream service is responsible for extracting the JSON chunk).
 *
 * Looks for expressions in either:
 *   a. VRM 1.0:  `extensions.VRMC_vrm.expressions.preset.<name>`
 *   b. VRM 0.x:  `extensions.VRM.blendShapeMaster.blendShapeGroups[].name`
 *   c. Generic:  `expressions: [{ name }]` or `blendShapes: [{ name }]`
 */
export function validateVrmBlendShapes(manifest: unknown): VrmBlendShapeValidationResult {
  const names = collectExpressionNames(manifest);
  const lowered = names.map((n) => n.toLowerCase());
  const found: Record<RequiredBlendShape, string | null> = {
    happy: null, sad: null, angry: null, surprised: null, neutral: null,
  };
  for (const required of REQUIRED_BLEND_SHAPES) {
    const aliases = ALIASES[required];
    const hit = lowered.find((n) => aliases.some((a) => n === a || n.includes(a)));
    found[required] = hit ?? null;
  }
  const missing = REQUIRED_BLEND_SHAPES.filter((r) => !found[r]);
  return {
    valid: missing.length === 0,
    missing,
    found,
    expressionCount: names.length,
  };
}

function collectExpressionNames(manifest: unknown): string[] {
  if (!manifest || typeof manifest !== 'object') return [];
  const m = manifest as any;
  const out: string[] = [];

  // VRM 1.0
  const vrm1Preset = m?.extensions?.VRMC_vrm?.expressions?.preset;
  if (vrm1Preset && typeof vrm1Preset === 'object') {
    out.push(...Object.keys(vrm1Preset));
  }
  const vrm1Custom = m?.extensions?.VRMC_vrm?.expressions?.custom;
  if (vrm1Custom && typeof vrm1Custom === 'object') {
    out.push(...Object.keys(vrm1Custom));
  }

  // VRM 0.x
  const vrm0Groups = m?.extensions?.VRM?.blendShapeMaster?.blendShapeGroups;
  if (Array.isArray(vrm0Groups)) {
    for (const g of vrm0Groups) {
      if (g?.name && typeof g.name === 'string') out.push(g.name);
      if (g?.presetName && typeof g.presetName === 'string') out.push(g.presetName);
    }
  }

  // Generic
  if (Array.isArray(m?.expressions)) {
    for (const e of m.expressions) {
      if (e?.name && typeof e.name === 'string') out.push(e.name);
    }
  }
  if (Array.isArray(m?.blendShapes)) {
    for (const e of m.blendShapes) {
      if (e?.name && typeof e.name === 'string') out.push(e.name);
    }
  }
  return out;
}
