/**
 * Unified API barrel (audit TD-4 / TD-11).
 *
 * Re-exports all 71 `*.api.ts` domain modules under a single import path:
 *
 *   // before
 *   import { axpApi } from '@/lib/api/axp.api';
 *   import { walletApi } from '@/lib/api/wallet.api';
 *
 *   // after
 *   import { axpApi, walletApi } from '@/lib/api';
 *
 * Existing direct imports from individual files continue to work  this
 * barrel is purely additive.
 *
 * --- Collision policy ---
 * A handful of names collide across modules. We pick one canonical file per
 * name (re-exported via `export *`) and alias the duplicate from the other
 * file to keep both reachable via the barrel.
 *
 *   AIPlatform    canonical = skill.api               (alias AICapabilityPlatform   ai-capability.api)
 *   BudgetPool    canonical = commerce.api            (alias V1BudgetPool           v1.api)
 *   SplitPlan     canonical = commerce.api            (alias V1SplitPlan            v1.api)
 *   KYCStatus     canonical = kyc.api                 (alias UserAgentKYCStatus     user-agent.api)
 *   merchantApi   canonical = merchant.api            (alias userMerchantApi        user.api)
 *   Product       canonical = product.api             (alias WebsiteProduct         website.api)
 */

// ---------- 0  HTTP client primitives ----------
export { apiClient, API_BASE_URL } from './client';
export type { ApiResponse } from './client';

// ---------- A  Account, auth, identity ----------
export * from './account.api';
export * from './auth.api';
export * from './kyc.api';                         // canonical KYCStatus
export * from './session.api';
export * from './social-account.api';
export * from './onboarding.api';
// user.api collides with merchant.api on `merchantApi`  selective re-export:
export type { UserProfile, UpdateUserDto, MerchantProfile } from './user.api';
export { userApi, merchantApi as userMerchantApi } from './user.api';

// ---------- B  Agents (templates, marketplace, teams, presence, account) ----------
export * from './agent.api';
export * from './agent-account.api';
export * from './agent-authorization.api';
export * from './agent-marketplace.api';
export * from './agent-presence.api';
export * from './agent-team.api';
export * from './agent-template.api';
// user-agent.api collides with kyc.api on `KYCStatus`  selective re-export:
export type {
  KYCStatus as UserAgentKYCStatus,
  KYCReuseStatus,
  MerchantTrustScore,
  PaymentMemory,
  Subscription,
  Budget,
  TransactionClassification,
} from './user-agent.api';
export { userAgentApi } from './user-agent.api';

// ---------- C  Pet / V1 / Phase-6 ----------
export * from './pet-phase6.api';
// v1.api collides with commerce.api on `BudgetPool` and `SplitPlan`  selective re-export:
export type {
  PetEmotion,
  PetState,
  PetPlanLevel,
  PetSoulSummary,
  PetSoulListResponse,
  PetSkinFormat,
  PetSkinSource,
  PetSkinVisibility,
  PetSkinModerationStatus,
  PetSkinDto,
  PetRoyaltyPayoutDto,
  PetRoyaltyPreviewDto,
  PetGenerationTaskEnvelope,
  WalletProjection,
  HandoffRecord,
  ApprovalRequest,
  AutoEarnSummary,
  AutoEarnEvent,
  SplitPlan as V1SplitPlan,
  BudgetPool as V1BudgetPool,
  FamilyAccount,
  CoSignRequest,
  PrivacyCategory,
  PrivacyItem,
  PrivacyGrant,
  PrivacyAuditEntry,
  MemoryTier,
  MemoryStats,
} from './v1.api';
export { v1Api } from './v1.api';

// ---------- D  Commerce, products, orders, cart ----------
export * from './cart.api';
export * from './commerce.api';                    // canonical BudgetPool & SplitPlan
export * from './commission.api';
export * from './coupon.api';
export * from './order.api';
export * from './product.api';                     // canonical Product
// website.api collides with product.api on `Product`  selective re-export:
export type { WebsiteStats, ContactForm, Service, Product as WebsiteProduct } from './website.api';
export { websiteApi } from './website.api';

// ---------- E  Payment, wallet, payouts ----------
export * from './auto-pay.api';
export * from './mpc-wallet.api';
export * from './pay-intent.api';
export * from './payment-history.api';
export * from './payment-status';
export * from './payment.api';
export * from './qr-payment.api';
export * from './quick-pay-grant.api';
export * from './receipt.api';
export * from './refund.api';
export * from './tax.api';
export * from './wallet.api';

// ---------- F  AXP, airdrop, token ----------
export * from './airdrop.api';
export * from './axp.api';
export * from './token.api';

// ---------- G  Auto-Earn ----------
export * from './auto-earn.api';
export * from './auto-earn-advanced.api';

// ---------- H  Marketplace, A2A, skills, datasets ----------
export * from './a2a.api';
export * from './acp.api';
export * from './marketplace.api';
export * from './merchant-task.api';
export * from './skill.api';                       // canonical AIPlatform (broader union)
// ai-capability.api collides with skill.api on `AIPlatform`  selective re-export:
export type {
  AIPlatform as AICapabilityPlatform,
  FunctionSchema,
  CapabilityInfo,
  ProductCapabilityInfo,
  ExecutionResult,
} from './ai-capability.api';
export { aiCapabilityApi } from './ai-capability.api';
export * from './unified-marketplace.api';
export * from './dataset.api';
export * from './expert-profile.api';
export * from './nft.api';

// ---------- I  Merchant, admin, developer ----------
export * from './admin.api';
export * from './developer-account.api';
export * from './merchant.api';                    // canonical merchantApi
export * from './saas-deployment.api';

// ---------- J  Misc utilities ----------
export * from './analytics.api';
export * from './api-key.api';
export * from './llm-router.api';
export * from './logistics.api';
export * from './memory-slot.api';
export * from './notification.api';
export * from './plugin.api';
export * from './prediction.api';
export * from './pricing.api';
export * from './referral.api';
export * from './sandbox.api';
export * from './search.api';
export * from './statistics.api';
export * from './ucp.api';
export * from './wearable-telemetry.api';
export * from './webhook.api';
export * from './workspace.api';
