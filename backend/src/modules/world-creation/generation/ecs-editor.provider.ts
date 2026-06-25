/**
 * EcsEditorProvider — pluggable natural-language → ECS_World edit backend
 * (design §2.3 / §2.4, R3.2).
 *
 * The natural-language editing flow ({@link EcsWorldService.applyNlEdit})
 * delegates the "turn an NL instruction into a concrete modification of an
 * existing ECS_World" step to this provider. Abstracting it behind an
 * injectable interface — mirroring {@link EcsGeneratorProvider} — keeps the
 * service deterministic and testable (task 14.4 can inject a provider that emits
 * an out-of-tier edit to exercise the boundary-rejection path) and lets a real
 * model (reusing the v5 LLM access) be wired in later without touching the
 * service or its tier-gating / diff logic.
 *
 * Contract (the provider is NOT trusted — the caller re-validates):
 *  - The provider receives the **current** ECS_World (`baseWorld`) plus the
 *    target Substrate_Tier and SHOULD return a modified ECS_World that stays
 *    within that tier and changes **only** the entities the instruction refers
 *    to, leaving unaffected entities byte-identical (R3.2 "preserve unaffected
 *    entities"). The caller computes the structural diff between base and result,
 *    so any unaffected entity is naturally preserved (no op is emitted for it).
 *  - The returned world's `plotId` / `substrateTier` are authoritatively
 *    overwritten by the caller; providers may set them but must not rely on
 *    them surviving. This makes it impossible for an NL edit to escalate the
 *    Plot's declared tier.
 *
 * @see .kiro/specs/ai-world-creation-platform/design.md — §2.3 Diff/Revert, §2.4 协同编辑连续谱
 */

import { Injectable } from '@nestjs/common';
import { deepClone } from '../ecs/ecs-diff';
import {
  type EcsEntity,
  type EcsWorld,
  type SubstrateTier,
} from '../../../../shared/types/world-creation';

/** Parameters handed to an {@link EcsEditorProvider} for a single NL edit. */
export interface ApplyNlEditParams {
  /** Owning Plot id (the result's {@link EcsWorld.plotId} is overwritten to this). */
  plotId: string;
  /** Natural-language edit instruction. */
  instruction: string;
  /** The current ECS_World the edit applies onto (never mutated by callers). */
  baseWorld: EcsWorld;
  /** The Plot's declared Substrate_Tier — the edit must stay within it. */
  substrateTier: SubstrateTier;
}

/**
 * Pluggable backend that turns a natural-language instruction into a modified
 * ECS_World. Implementations may call a real model; the default
 * {@link PlaceholderEcsEditorProvider} returns a deterministic, structured
 * modification so the platform is usable end-to-end (and testable) before a
 * model is wired in.
 */
export interface EcsEditorProvider {
  /**
   * Apply an NL instruction to `params.baseWorld`, returning a new ECS_World.
   * SHOULD modify only the affected entities and stay within
   * `params.substrateTier`; the caller re-validates and rejects out-of-tier
   * output regardless, and diffs base → result so unaffected entities are kept.
   */
  applyNlEdit(params: ApplyNlEditParams): Promise<EcsWorld>;
}

/** DI token for the {@link EcsEditorProvider} (interfaces have no runtime token). */
export const ECS_EDITOR_PROVIDER = Symbol('ECS_EDITOR_PROVIDER');

/** Trim + collapse whitespace and cap an instruction so it is safe to embed in `ui.text`. */
function summarizeInstruction(instruction: string): string {
  const collapsed = (instruction ?? '').replace(/\s+/g, ' ').trim();
  if (collapsed.length === 0) return 'Untitled edit';
  return collapsed.length > 80 ? `${collapsed.slice(0, 77)}...` : collapsed;
}

/**
 * Default {@link EcsEditorProvider} — applies a deterministic, declarative-only
 * modification that records the NL instruction without touching existing
 * entities.
 *
 * The modification appends a single declarative annotation entity (a `ui` text
 * note carrying the instruction summary) and stamps `meta.lastNlEdit`. It adds
 * NO `rules` / `logicModules`, so it is **safe by construction** and valid for
 * ANY declared tier (A, B, or C) — the default flow never produces a spurious
 * tier violation. Crucially it leaves every pre-existing entity byte-identical,
 * so the caller's structural diff preserves all unaffected entities (R3.2).
 *
 * A real model provider can later emit richer, instruction-targeted edits; the
 * caller's tier-gating + diff stay the safety and preservation boundary.
 */
@Injectable()
export class PlaceholderEcsEditorProvider implements EcsEditorProvider {
  async applyNlEdit(params: ApplyNlEditParams): Promise<EcsWorld> {
    const summary = summarizeInstruction(params.instruction);

    // Clone so the caller's baseWorld is never mutated (keeps diff(base, result)
    // honest — unaffected entities remain referentially distinct but equal).
    const world = deepClone(params.baseWorld);

    // Deterministic, collision-free annotation id derived from existing notes.
    const noteCount = world.entities.filter((e) => e.id.startsWith('nl_note_')).length;
    const note: EcsEntity = {
      id: `nl_note_${noteCount}`,
      components: {
        ui: { panel: 'nl_annotation', text: summary },
      },
    };

    world.entities = [...world.entities, note];
    world.meta = { ...(world.meta ?? {}), lastNlEdit: summary };

    return world;
  }
}
