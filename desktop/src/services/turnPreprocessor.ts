/**
 * Desktop mirror of turnPreprocessor (P2-C skeleton).
 * Keep the contract identical to mobile so call sites can share logic later.
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
  readonly augmentedPrompt?: string;
  readonly systemAugment?: string;
  readonly preselectedTools?: ReadonlyArray<string>;
  readonly reason: string;
}

const NOOP_OUTPUT: PreprocessOutput = { strategy: 'none', reason: 'disabled' };

export async function preprocessTurn(_input: PreprocessInput): Promise<PreprocessOutput> {
  // TODO(P2-C): use desktop-local Gemma (once desktop local inference ships) for
  // the same strategies as mobile.  Return NOOP_OUTPUT on any failure.
  return NOOP_OUTPUT;
}
