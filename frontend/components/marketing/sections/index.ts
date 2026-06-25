/**
 * Marketing sections barrel.
 *
 * Aggregates all marketing landing-page sections into a single import path.
 * Consumers should `import { HeroLiving, PricingTable } from '../../components/marketing/sections'`.
 *
 * Per-section file layout (see audit P3.1):
 *   - HeroLiving         · v4 mesh-gradient hero
 *   - ThreeLayerVision   · Living / Doer / Economy
 *   - FiveSurfaceStrip   · Mobile / Desktop / Web / Watch / Server strip
 *   - CompetitiveTable   · Agentrix vs ChatGPT / Copilot / Character
 *   - PricingTable       · 5 tiers + Enterprise wide card
 *   - DownloadCallout    · Final 5-surface download CTA
 *   - FAQ                · 8 frequently-asked items
 *   - V3FeaturesSection  · 8 v3 capability cards
 *   - ThreeSideEcosystem · Supply / Consume / Connect roles
 *   - AxpNarrative       · 6 earn + 5 spend + cashback ladder
 */
export { HeroLiving } from './HeroLiving';
export { ThreeLayerVision } from './ThreeLayerVision';
export { FiveSurfaceStrip } from './FiveSurfaceStrip';
export { CompetitiveTable } from './CompetitiveTable';
export { PricingTable } from './PricingTable';
export { DownloadCallout } from './DownloadCallout';
export { FAQ } from './FAQ';
export { V3FeaturesSection } from './V3FeaturesSection';
export { ThreeSideEcosystem } from './ThreeSideEcosystem';
export { AxpNarrative } from './AxpNarrative';

// Shared pricing data — exported so other surfaces (e.g. /pricing page) can re-use the
// same source-of-truth tier definitions without importing a section component.
export { PRICING_TIERS, type PricingTier } from './_shared';
