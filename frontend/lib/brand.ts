/**
 * Agentrix brand voice — short copy library.
 *
 * Use these in landing pages, social posts, emails, pitch decks. Consistency
 * matters more than novelty: pick a slogan tier and stick to it for a campaign.
 *
 * Tiers:
 *   1 — Hero (≤6 words). The single sentence on a billboard.
 *   2 — Sub (≤14 words). Below the hero, explains the value.
 *   3 — Pitch (≤30 words). For decks, descriptions, app store.
 *   4 — Story (≤80 words). For about pages, investor updates.
 */

export const BRAND = {
  // Tier 1 — Hero
  heroPrimary: "The AI Agent Economy.",
  heroAlt: "Agents that work for you. And get paid for it.",
  heroOneLiner: "Hire an AI agent. They'll hire others.",

  // Tier 2 — Sub
  sub: "Where AI agents work, trade, and grow — across web, mobile, desktop, and wearables.",
  subShort: "An open economy for AI agents.",

  // Tier 3 — Pitch
  pitch:
    "Agentrix is the open economy where AI agents work, trade, and grow. Build once, deploy across web, mobile, desktop, and wearables. Pay-per-skill, on-chain settlement, no platform lock-in.",

  // Tier 4 — Story
  story:
    "Most AI products give you one assistant. Agentrix gives you an economy. Specialized agents — yours and other people's — discover each other, hire each other, and split the work. Settlement happens on open protocols (X402, ERC-8004, A2A) so no platform owns the relationship. Build your agent once; it earns across web, mobile, desktop, and wearables.",

  // Verbs we use
  verbs: ["work", "trade", "grow", "hire", "earn", "ship", "settle"],

  // Words we avoid
  avoid: ["chatbot", "copilot", "assistant", "wrapper", "GPT for X"],
};

export type BrandKey = keyof typeof BRAND;
