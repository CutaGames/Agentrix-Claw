/**
 * Unified system-prompt builder.
 *
 * Produces deterministic system prompts from structured agent metadata, so that
 * local (Gemma) and cloud (Claude/Gemini/etc.) tiers receive a consistent identity
 * without the agent's persona text accidentally hardcoding a specific underlying model.
 *
 * IMPORTANT: Do NOT embed "powered by X" / "I am Gemini/Claude" in agent
 * descriptions. The runtime model is a deployment detail, not part of persona.
 */

import type { ExecutionTier } from './turnRouter';

export interface PersonaInput {
  agentName: string;
  /** Free-form persona / role description from agent config. */
  agentContext?: string | null;
  /** Two-letter locale hint (e.g. 'zh', 'en'). Used to gently nudge language. */
  locale?: string;
}

export interface BuildSystemPromptArgs extends PersonaInput {
  tier: ExecutionTier;
}

const LOCAL_IDENTITY_RULES = [
  'You run locally on the user\'s device via Agentrix runtime.',
  'If asked what model / LLM / engine powers you, answer: "I am an Agentrix agent running locally." Do NOT name specific underlying models (Gemini, Claude, GPT, Gemma, Llama, etc.), even if internal training suggests one.',
  'Do not claim to be Gemini, Claude, GPT, Bard, or any other assistant.',
  'Favour concise, complete answers. Avoid filler.',
].join(' ');

const CLOUD_IDENTITY_RULES = [
  'You run on Agentrix cloud infrastructure with full tool access.',
  'If asked what model powers you, answer: "I am an Agentrix agent backed by cloud models." Do not reveal the specific provider/model name unless the user explicitly asks for deployment details.',
  'You may call tools when they help.',
].join(' ');

export function buildSystemPrompt(args: BuildSystemPromptArgs): string {
  const { agentName, agentContext, tier, locale } = args;

  const identity = `You are ${agentName}, an Agentrix AI agent.`;
  const rules = tier === 'local' ? LOCAL_IDENTITY_RULES : CLOUD_IDENTITY_RULES;
  const language = locale === 'zh'
    ? 'Reply in Simplified Chinese by default unless the user writes in another language.'
    : 'Reply in the user\'s language.';

  const persona = sanitizeAgentContext(agentContext);

  const parts = [identity, rules, language];
  if (persona) parts.push(`Persona:\n${persona}`);
  // Closing reinforcement — last instruction has disproportionate weight.
  parts.push(`Remember: you are ${agentName}. Never contradict this identity.`);

  const raw = parts.join('\n\n');
  // Gemma 4 2B has a small context window (~2 048 tokens). Cap local system
  // prompts to ~600 chars (≈150 tokens) so the conversation history budget
  // is not accidentally over-consumed before any turns are exchanged.
  if (tier === 'local' && raw.length > 600) {
    return raw.slice(0, 600);
  }
  return raw;
}

/**
 * Strip phrases that falsely declare the underlying model.
 * Keeps persona/role description intact.
 */
export function sanitizeAgentContext(raw?: string | null): string {
  if (!raw) return '';
  const patterns: RegExp[] = [
    /my (underlying |底层\s*)?(model|engine|llm|驱动)[^\n]*?(gemini|claude|gpt|gemma|llama|qwen|mistral|deepseek)[^\n]*/gi,
    /powered by (gemini|claude|gpt|gemma|llama|qwen|mistral|deepseek)[^\n]*/gi,
    /我的底层驱动是[^\n。]*/g,
    /我基于[^\n。]*(gemini|claude|gpt|gemma)[^\n]*/gi,
  ];
  let cleaned = raw;
  for (const p of patterns) cleaned = cleaned.replace(p, '');
  return cleaned.trim();
}
