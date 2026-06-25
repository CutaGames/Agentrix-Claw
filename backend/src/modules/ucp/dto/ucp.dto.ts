/**
 * UCP (Universal Commerce Protocol) DTOs
 * 
 * Based on UCP 2026-01-11 specification
 * https://ucp.dev/specification/overview/
 */

// ============ Core Types ============

export interface UCPVersion {
  version: string; // YYYY-MM-DD format
}

export interface UCPCapability {
  name: string;    // e.g., "dev.ucp.shopping.checkout"
  version: string; // YYYY-MM-DD format
  spec?: string;
  schema?: string;
  extends?: string;
  config?: Record<string, any>;
}

export interface UCPService {
  version: string;
  spec: string;
  rest?: {
    schema: string;
    endpoint: string;
  };
  mcp?: {
    schema: string;
    endpoint: string;
  };
  a2a?: {
    endpoint: string;
  };
  embedded?: {
    schema: string;
  };
}

// ============ Payment Types ============

export interface UCPPaymentHandler {
  id: string;
  name: string;    // e.g., "com.google.pay"
  version: string;
  spec: string;
  config_schema?: string;
  instrument_schemas?: string[];
  config: Record<string, any>;
}

export interface UCPPaymentInstrument {
  id: string;
  handler_id: string;
  type: string;    // "card", "wallet", etc.
  brand?: string;
  last_digits?: string;
  billing_address?: UCPAddress;
  credential: {
    type: string;  // "PAYMENT_GATEWAY", "NETWORK_TOKEN", etc.
    token: string;
  };
}

export interface UCPPaymentData {
  id: string;
  handler_id: string;
  type: string;
  brand?: string;
  last_digits?: string;
  rich_card_art?: string;
  rich_text_description?: string;
  billing_address?: UCPAddress;
  credential: {
    type: string;
    token: string;
  };
}

// ============ Address & Buyer Types ============

export interface UCPAddress {
  full_name?: string;
  first_name?: string;
  last_name?: string;
  street_address: string;
  extended_address?: string;
  address_locality: string;  // city
  address_region: string;    // state/province
  postal_code: string;
  address_country: string;   // ISO 3166-1 alpha-2
}

export interface UCPBuyer {
  email?: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
}

// ============ Line Item Types ============

export interface UCPItem {
  id: string;
  title: string;
  description?: string;
  price: number;           // Minor units (cents)
  image_url?: string;
  product_url?: string;
  product_id?: string;     // Optional internal product reference
  sku?: string;
  gtin?: string;
}

export interface UCPLineItem {
  id: string;
  item: UCPItem;
  quantity: number;
  unit_price?: number;
  subtotal?: number;
}

// ============ Totals Types ============

export type UCPTotalType = 
  | 'subtotal' 
  | 'tax' 
  | 'shipping' 
  | 'discount' 
  | 'total';

export interface UCPTotal {
  type: UCPTotalType;
  amount: number;          // Minor units (cents)
  label?: string;
}

// ============ Fulfillment Types ============

export interface UCPFulfillmentOption {
  id: string;
  title: string;
  description?: string;
  totals: UCPTotal[];
  estimated_delivery?: {
    min_days?: number;
    max_days?: number;
    date?: string;
  };
}

export interface UCPFulfillmentGroup {
  id: string;
  line_item_ids: string[];
  selected_option_id?: string;
  options: UCPFulfillmentOption[];
}

export interface UCPFulfillmentMethod {
  id: string;
  type: 'shipping' | 'pickup' | 'digital';
  line_item_ids: string[];
  selected_destination_id?: string;
  destinations: UCPAddress[];
  groups: UCPFulfillmentGroup[];
}

export interface UCPFulfillment {
  methods: UCPFulfillmentMethod[];
}

// ============ Message Types ============

export type UCPMessageSeverity = 
  | 'info' 
  | 'warning' 
  | 'requires_buyer_input' 
  | 'fatal';

export interface UCPMessage {
  type: 'info' | 'warning' | 'error';
  code: string;
  content: string;
  message?: string;
  severity: UCPMessageSeverity;
  field_path?: string;
}

// ============ Checkout Session Types ============

export type UCPCheckoutStatus = 
  | 'incomplete' 
  | 'ready_for_complete' 
  | 'complete' 
  | 'cancelled'
  | 'requires_escalation';

export interface UCPCheckoutSession {
  ucp: {
    version: string;
    capabilities: UCPCapability[];
  };
  id: string;
  status: UCPCheckoutStatus;
  currency: string;
  buyer?: UCPBuyer;
  line_items: UCPLineItem[];
  totals: UCPTotal[];
  payment?: {
    handlers: UCPPaymentHandler[];
    selected_handler_id?: string;
  };
  fulfillment?: UCPFulfillment;
  messages?: UCPMessage[];
  links?: UCPLink[];
  continue_url?: string;
  merchant_order_id?: string;
  created_at?: string;
  updated_at?: string;
  // Extended fields for Agentrix
  order?: {
    id: string;
    status?: string;
  };
  error?: {
    code?: string;
    message?: string;
  };
}

export interface UCPLink {
  rel: string;
  href: string;
  method?: string;
}

// ============ Profile Types ============

export interface UCPBusinessProfile {
  ucp: {
    version: string;
    services: Record<string, UCPService>;
    capabilities: UCPCapability[];
  };
  payment: {
    handlers: UCPPaymentHandler[];
  };
  signing_keys?: UCPSigningKey[];
}

export interface UCPPlatformProfile {
  ucp: {
    version: string;
    capabilities: UCPCapability[];
  };
  payment?: {
    handlers: UCPPaymentHandler[];
  };
  signing_keys?: UCPSigningKey[];
}

export interface UCPSigningKey {
  kid: string;
  kty: string;
  crv?: string;
  x?: string;
  y?: string;
  use: string;
  alg: string;
}

// ============ Request/Response DTOs ============

export class CreateCheckoutDto {
  line_items: UCPLineItem[];
  buyer?: UCPBuyer;
  currency?: string;
  fulfillment?: UCPFulfillment;
  metadata?: Record<string, any>;
}

export class UpdateCheckoutDto {
  id: string;
  buyer?: UCPBuyer;
  line_items?: UCPLineItem[];
  fulfillment?: UCPFulfillment;
}

export class CompleteCheckoutDto {
  payment_data: UCPPaymentData;
  risk_signals?: Record<string, any>;
  ap2?: {
    checkout_mandate?: string;
    payment_mandate?: string;
  };
}

export class CancelCheckoutDto {
  reason?: string;
}

// ============ AP2 Mandate Types ============

export interface AP2Mandate {
  id: string;
  agent_id: string;           // Agent authorized to use this mandate
  principal_id?: string;      // Principal who granted the mandate
  max_amount: number;         // Maximum per-transaction amount
  currency: string;
  valid_from: string;
  valid_until: string;
  allowed_merchants: string[]; // Empty array means all merchants
  allowed_categories: string[]; // Empty array means all categories
  used_amount: number;        // Total amount used
  transaction_count: number;  // Number of transactions
  status: 'active' | 'expired' | 'revoked' | 'exhausted';
  created_at: string;
  updated_at: string;
  // Legacy fields for backward compatibility
  type?: 'checkout' | 'payment';
  issuer?: string;
  subject?: string;
  issued_at?: string;
  expires_at?: string;
  scope?: {
    merchant_id: string;
    max_amount?: number;
    currency?: string;
  };
  signature?: string;
}

export interface CreateMandateDto {
  agent_id: string;
  principal_id?: string;
  max_amount: number;
  currency?: string;
  valid_until?: string;
  allowed_merchants?: string[];
  allowed_categories?: string[];
}

export interface MandateVerificationResult {
  valid: boolean;
  reason?: string;
  remaining_amount?: number;
}

// ============ Risk Signals ============

export interface UCPRiskSignals {
  session_id?: string;
  score?: number;
  device_fingerprint?: string;
  ip_address?: string;
  user_agent?: string;
}

// ============ UCP Order Types ============

export interface UCPOrder {
  id: string;
  checkout_session_id: string;
  internal_order_id?: string;  // Reference to Agentrix Order entity
  status: 'pending' | 'processing' | 'shipped' | 'delivered' | 'cancelled' | 'refunded';
  buyer: UCPBuyer;
  line_items: UCPLineItem[];
  totals: UCPTotal[];
  currency: string;
  payment_handler: string;
  fulfillment?: UCPFulfillment;
  tracking?: {
    carrier?: string;
    tracking_number?: string;
    tracking_url?: string;
    estimated_delivery?: string;
  };
  created_at: string;
  updated_at: string;
}

// ============ Identity Linking Types ============

export interface IdentityLink {
  id: string;
  ucp_buyer_email: string;
  agentrix_user_id: string;
  linked_at: string;
  verified: boolean;
  verified_at?: string;
  revoked_at?: string;
  verification_method?: 'email' | 'oauth' | 'manual';
  metadata?: Record<string, any>;
}

export interface LinkIdentityDto {
  ucp_buyer_email: string;
  agentrix_user_id: string;
  verification_method?: 'email' | 'oauth' | 'manual';
  metadata?: Record<string, any>;
}

// ============ Platform Capability Types (Phase 3) ============

export interface DiscoveredMerchant {
  id: string;
  url: string;
  name: string;
  description?: string;
  logo?: string;
  ucp_version: string;
  capabilities: string[];
  payment_handlers: { id: string; name: string }[];
  services: string[];
  discovered_at: string;
  verified: boolean;
  error?: string;
  raw_profile?: any;
}

export interface ExternalCheckoutResult {
  success: boolean;
  merchant_url?: string;
  merchant_name?: string;
  session?: UCPCheckoutSession;
  error?: string;
  message?: string;
}
