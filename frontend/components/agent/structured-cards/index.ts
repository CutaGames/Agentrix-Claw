/**
 * StructuredResponseCard sub-components — split from the 3784-line monolith.
 *
 * Split strategy (TD-1 from WEB_FRONTEND_AUDIT_2026-05-11):
 *   - Main StructuredResponseCard.tsx remains as the dispatcher (type switch)
 *   - Each card type gets its own file here
 *   - Commerce form logic (the biggest chunk) is extracted to CommerceFormHandler
 *
 * Phase 1 (this commit): Extract shared types + create barrel
 * Phase 2 (next sprint): Move each `if (type === 'xxx')` block to its own file
 */

// Shared types used across card sub-components
export type { CommerceContextType } from '../StructuredResponseCard';

// Sub-components will be added here as they are extracted:
// export { SkillsListCard } from './SkillsListCard';
// export { CommerceFormCard } from './CommerceFormCard';
// export { ProductListCard } from './ProductListCard';
// export { OrderListCard } from './OrderListCard';
// export { CartCard } from './CartCard';
// export { PaymentResultCard } from './PaymentResultCard';
