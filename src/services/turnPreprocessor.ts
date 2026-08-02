/**
 * turnPreprocessor — P2-C skeleton
 *
 * Goal: use the local Gemma model as a lightweight preprocessor for cloud turns.
 * Example use cases (not yet implemented):
 *   - OCR/caption local image attachments before shipping them to cloud
 *   - Summarize very long contexts to reduce cloud token spend
 *   - Pre-select which tools to expose based on a cheap local intent classifier
 *
 * The contract below is stable so call sites can wire the hook today; individual
 * strategies can be filled in incrementally without touching callers.
 */

export type PreprocessStrategy =
  | 'none'
  | 'image-caption'
  | 'context-summary'
  | 'tool-preselect';

export interface PreprocessInput {
  readonly userText: string;
  readonly attachments?: ReadonlyArray<{ mimeType: string; size?: number }>;
  readonly approxContextTokens?: number;
  readonly availableTools?: ReadonlyArray<string>;
}

export interface PreprocessOutput {
  readonly strategy: PreprocessStrategy;
  /** Optional augmented user prompt. */
  readonly augmentedPrompt?: string;
  /** Optional short summary to prepend as system context. */
  readonly systemAugment?: string;
  /** Optional subset of tool names to expose to the cloud turn. */
  readonly preselectedTools?: ReadonlyArray<string>;
  /** For telemetry / debugging. */
  readonly reason: string;
}

const NOOP_OUTPUT: PreprocessOutput = { strategy: 'none', reason: 'disabled' };

export async function preprocessTurn(_input: PreprocessInput): Promise<PreprocessOutput> {
  // TODO(P2-C): route to local Gemma model for cheap preprocessing.
  //   1. Pick strategy by input shape.
  //   2. If strategy === 'image-caption', feed each image through local vision model.
  //   3. If strategy === 'context-summary', ask local model to produce <=200 token summary.
  //   4. If strategy === 'tool-preselect', ask local model which tools are relevant.
  //   5. Fall back to NOOP_OUTPUT on any error so the cloud turn is never blocked.
  return NOOP_OUTPUT;
}
