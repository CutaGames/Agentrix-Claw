/**
 * stripeCheckout.service.ts — Sprint G #13
 *
 * Stripe in-app checkout service. Supports:
 *   1. Subscription upgrade/downgrade (5 tiers)
 *   2. Skin purchase (one-time)
 *   3. AXP top-up (one-time)
 *
 * Flow:
 *   Mobile → POST /v1/checkout/session → receives { url, session_id }
 *   Mobile → opens expo-web-browser with Stripe Checkout URL
 *   Stripe redirects to agentrix://checkout/success?session_id=xxx
 *   Mobile deep link handler resolves → shows success toast
 *
 * For native payment sheet (Apple Pay / Google Pay), we use the
 * Stripe Payment Sheet via the backend's PaymentIntent flow.
 */
import { apiFetch } from './api';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';

// ── Types ────────────────────────────────────────────────────

export type CheckoutMode = 'subscription' | 'payment';

export interface CheckoutSessionRequest {
  mode: CheckoutMode;
  /** For subscription: target tier */
  tier?: string;
  /** For subscription: billing cycle */
  billing_cycle?: 'monthly' | 'yearly';
  /** For payment: line items */
  line_items?: Array<{
    type: 'skin' | 'axp_topup' | 'skill' | 'task_bounty';
    resource_id: string;
    quantity?: number;
  }>;
  /** AXP amount to apply as discount (0 = none) */
  axp_discount_amount?: number;
  /** Return URL after success */
  success_url?: string;
  /** Return URL after cancel */
  cancel_url?: string;
}

export interface CheckoutSessionResponse {
  session_id: string;
  url: string;
  expires_at: number;
  amount_total_cents: number;
  currency: string;
  axp_discount_applied: number;
}

export interface PaymentIntentResponse {
  client_secret: string;
  payment_intent_id: string;
  amount_cents: number;
  currency: string;
  ephemeral_key: string;
  customer_id: string;
}

// ── API ──────────────────────────────────────────────────────

/**
 * Create a Stripe Checkout Session on the backend.
 */
export async function createCheckoutSession(
  request: CheckoutSessionRequest,
): Promise<CheckoutSessionResponse> {
  const successUrl = request.success_url || Linking.createURL('checkout/success');
  const cancelUrl = request.cancel_url || Linking.createURL('checkout/cancel');

  return apiFetch<CheckoutSessionResponse>('/v1/checkout/session', {
    method: 'POST',
    body: JSON.stringify({
      ...request,
      success_url: successUrl,
      cancel_url: cancelUrl,
    }),
  });
}

/**
 * Create a PaymentIntent for native payment sheet (Apple Pay / Google Pay).
 * Used for one-time purchases where we want the native sheet UX.
 */
export async function createPaymentIntent(input: {
  type: 'skin' | 'axp_topup' | 'skill';
  resource_id: string;
  axp_discount_amount?: number;
}): Promise<PaymentIntentResponse> {
  return apiFetch<PaymentIntentResponse>('/v1/checkout/payment-intent', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

// ── Checkout Flow ────────────────────────────────────────────

/**
 * Open Stripe Checkout in an in-app browser.
 * Returns the result URL (success or cancel).
 */
export async function openStripeCheckout(
  request: CheckoutSessionRequest,
): Promise<{ success: boolean; sessionId?: string }> {
  const session = await createCheckoutSession(request);

  const result = await WebBrowser.openAuthSessionAsync(
    session.url,
    Linking.createURL('checkout'),
  );

  if (result.type === 'success' && result.url) {
    const parsed = Linking.parse(result.url);
    const isSuccess = parsed.path?.includes('success');
    return {
      success: !!isSuccess,
      sessionId: session.session_id,
    };
  }

  return { success: false };
}

/**
 * Convenience: subscribe to a tier.
 */
export async function subscribeToTier(
  tier: string,
  billingCycle: 'monthly' | 'yearly' = 'monthly',
  axpDiscount = 0,
): Promise<{ success: boolean; sessionId?: string }> {
  return openStripeCheckout({
    mode: 'subscription',
    tier,
    billing_cycle: billingCycle,
    axp_discount_amount: axpDiscount,
  });
}

/**
 * Convenience: purchase a skin.
 */
export async function purchaseSkin(
  skinId: string,
  axpDiscount = 0,
): Promise<{ success: boolean; sessionId?: string }> {
  return openStripeCheckout({
    mode: 'payment',
    line_items: [{ type: 'skin', resource_id: skinId }],
    axp_discount_amount: axpDiscount,
  });
}

/**
 * Verify a completed checkout session.
 */
export async function verifyCheckoutSession(
  sessionId: string,
): Promise<{ status: 'complete' | 'expired' | 'open'; tier?: string }> {
  return apiFetch(`/v1/checkout/session/${sessionId}/verify`);
}
