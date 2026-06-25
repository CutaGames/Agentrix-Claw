/**
 * EcsGeneratorProvider — pluggable prompt → ECS_World draft generation backend
 * (design §2.4 / §11, R3.1).
 *
 * The Agent_Builder prompt-drive flow ({@link AgentBuilderService.generateDraft})
 * delegates the "turn a natural-language prompt into an ECS_World draft" step to
 * this provider. Abstracting it behind an injectable interface keeps the service
 * deterministic and testable (task 14.4 can inject a provider that emits an
 * out-of-tier world to exercise the boundary-rejection path) and lets a real
 * model (reusing the v5 LLM access, e.g. BedrockIntegrationService) be wired in
 * later without touching the service or its tier-gating logic.
 *
 * Contract:
 *  - The provider receives the **target Substrate_Tier** (the Plot's declared
 *    tier) and SHOULD generate within it. It is NOT trusted to do so — the
 *    caller re-validates with `validateEcsWorld` + `validateTier` and rejects
 *    out-of-tier output before any persistence (R3.6 / R4.7). The provider
 *    therefore never has authority over the tier ceiling.
 *  - The returned world's `plotId` / `substrateTier` are authoritatively
 *    overwritten by the caller; providers may set them but must not rely on
 *    them surviving.
 *
 * @see .kiro/specs/ai-world-creation-platform/design.md — §2.4 协同编辑连续谱, §11
 */

import { Injectable } from '@nestjs/common';
import {
  ECS_VERSION,
  type EcsEntity,
  type EcsWorld,
  type SubstrateTier,
} from '../../../../shared/types/world-creation';

/** Parameters handed to an {@link EcsGeneratorProvider} for a single generation. */
export interface GenerateEcsDraftParams {
  /** Owning Plot id (becomes {@link EcsWorld.plotId}). */
  plotId: string;
  /** Natural-language creation prompt. */
  prompt: string;
  /** Target tier the draft must stay within (the Plot's declared Substrate_Tier). */
  substrateTier: SubstrateTier;
  /** Optional display title hint for the generated world. */
  title?: string;
}

/**
 * Pluggable backend that turns a natural-language prompt into an ECS_World
 * draft. Implementations may call a real model; the default
 * {@link PlaceholderEcsGeneratorProvider} returns a deterministic, structured
 * placeholder so the platform is usable end-to-end (and testable) before a
 * model is wired in.
 */
export interface EcsGeneratorProvider {
  /**
   * Generate an ECS_World draft from a prompt. SHOULD produce content within
   * `params.substrateTier`; the caller re-validates and rejects out-of-tier
   * output regardless.
   */
  generateDraft(params: GenerateEcsDraftParams): Promise<EcsWorld>;
}

/** DI token for the {@link EcsGeneratorProvider} (interfaces have no runtime token). */
export const ECS_GENERATOR_PROVIDER = Symbol('ECS_GENERATOR_PROVIDER');

/** Trim + collapse whitespace and cap a prompt so it is safe to embed in `ui.text`. */
function summarizePrompt(prompt: string): string {
  const collapsed = (prompt ?? '').replace(/\s+/g, ' ').trim();
  if (collapsed.length === 0) return 'Untitled creation';
  return collapsed.length > 80 ? `${collapsed.slice(0, 77)}...` : collapsed;
}

/**
 * Default {@link EcsGeneratorProvider} — emits a deterministic, declarative-only
 * placeholder ECS_World draft.
 *
 * The placeholder contains only Tier_A declarative scene-graph data (a floor +
 * a label sign carrying the prompt summary) and NO `rules` / `logicModules`.
 * That makes it **safe by construction** and valid for ANY declared tier (A, B,
 * or C all permit declarative-only worlds), so the default flow never produces a
 * spurious tier violation. A real model provider can later emit richer
 * tier-appropriate content; the caller's tier-gating stays the safety boundary.
 */
@Injectable()
export class PlaceholderEcsGeneratorProvider implements EcsGeneratorProvider {
  async generateDraft(params: GenerateEcsDraftParams): Promise<EcsWorld> {
    const summary = summarizePrompt(params.prompt);
    const title = params.title?.trim() || summary;

    const entities: EcsEntity[] = [
      {
        id: 'ground',
        components: {
          transform: { pos: [0, 0, 0] },
          mesh: { preset: 'floor_plane' },
          collider: { shape: 'box', walkable: true },
        },
      },
      {
        id: 'title_sign',
        components: {
          transform: { pos: [0, 1, 0] },
          ui: { panel: 'title', text: title },
        },
      },
    ];

    return {
      ecsVersion: ECS_VERSION,
      plotId: params.plotId,
      substrateTier: params.substrateTier,
      entities,
      meta: {
        createdBy: 'agent',
        title,
        kind: 'prompt_draft',
        sourcePrompt: summary,
      },
    };
  }
}
