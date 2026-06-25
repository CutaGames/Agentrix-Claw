/**
 * UCP Service
 * 
 * Implements Universal Commerce Protocol (UCP) 2026-01-11
 * Handles checkout sessions, payment handlers, and profile management
 */

import { Injectable, Logger, NotFoundException, BadRequestException, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import {
  UCPBusinessProfile,
  UCPCheckoutSession,
  UCPPaymentHandler,
  UCPCapability,
  UCPLineItem,
  UCPTotal,
  CreateCheckoutDto,
  UpdateCheckoutDto,
  CompleteCheckoutDto,
  UCPCheckoutStatus,
  UCPBuyer,
  UCPFulfillment,
  UCPPaymentData,
  AP2Mandate,
  CreateMandateDto,
  MandateVerificationResult,
  UCPOrder,
  IdentityLink,
  LinkIdentityDto,
  DiscoveredMerchant,
  ExternalCheckoutResult,
} from './dto/ucp.dto';
import { OrderService } from '../order/order.service';
import { AssetType, OrderStatus } from '../../entities/order.entity';
import { Skill, SkillStatus, SkillPricingType } from '../../entities/skill.entity';
import { Product, ProductStatus } from '../../entities/product.entity';
import { UCPCheckoutSessionEntity, CheckoutSessionStatus } from '../../entities/ucp-checkout-session.entity';
import { AP2MandateEntity, MandateStatus } from '../../entities/ap2-mandate.entity';

const UCP_VERSION = '2026-01-11';

@Injectable()
export class UCPService {
  private readonly logger = new Logger(UCPService.name);
  // In-memory caches kept for hot-path performance; DB is source of truth
  private readonly checkoutSessions = new Map<string, UCPCheckoutSession>();
  private readonly ucpOrders = new Map<string, UCPOrder>(); // UCP order tracking

  constructor(
    private configService: ConfigService,
    @Inject(forwardRef(() => OrderService))
    private orderService: OrderService,
    @InjectRepository(Skill)
    private skillRepository: Repository<Skill>,
    @InjectRepository(Product)
    private productRepository: Repository<Product>,
    @InjectRepository(UCPCheckoutSessionEntity)
    private checkoutSessionRepository: Repository<UCPCheckoutSessionEntity>,
    @InjectRepository(AP2MandateEntity)
    private mandateRepository: Repository<AP2MandateEntity>,
  ) {}

  /**
   * Get Business Profile for /.well-known/ucp
   */
  getBusinessProfile(): UCPBusinessProfile {
    const baseUrl = this.configService.get('API_BASE_URL', 'https://api.agentrix.io');
    
    return {
      ucp: {
        version: UCP_VERSION,
        services: {
          'dev.ucp.shopping': {
            version: UCP_VERSION,
            spec: 'https://ucp.dev/specification/overview',
            rest: {
              schema: 'https://ucp.dev/services/shopping/rest.openapi.json',
              endpoint: `${baseUrl}/ucp/v1`,
            },
            mcp: {
              schema: 'https://ucp.dev/services/shopping/mcp.openrpc.json',
              endpoint: `${baseUrl}/api/mcp/sse`,
            },
          },
        },
        capabilities: this.getSupportedCapabilities(),
      },
      payment: {
        handlers: this.getPaymentHandlers(),
      },
      signing_keys: [
        {
          kid: 'agentrix_2026',
          kty: 'EC',
          crv: 'P-256',
          x: 'WbbXwVYGdJoP4Xm3qCkGvBRcRvKtEfXDbWvPzpPS8LA',
          y: 'sP4jHHxYqC89HBo8TjrtVOAGHfJDflYxw7MFMxuFMPY',
          use: 'sig',
          alg: 'ES256',
        },
      ],
    };
  }

  /**
   * Get supported UCP capabilities
   */
  private getSupportedCapabilities(): UCPCapability[] {
    return [
      {
        name: 'dev.ucp.shopping.checkout',
        version: UCP_VERSION,
        spec: 'https://ucp.dev/specification/checkout',
        schema: 'https://ucp.dev/schemas/shopping/checkout.json',
      },
      {
        name: 'dev.ucp.shopping.fulfillment',
        version: UCP_VERSION,
        spec: 'https://ucp.dev/specification/fulfillment',
        schema: 'https://ucp.dev/schemas/shopping/fulfillment.json',
        extends: 'dev.ucp.shopping.checkout',
      },
      {
        name: 'dev.ucp.shopping.discount',
        version: UCP_VERSION,
        spec: 'https://ucp.dev/specification/discount',
        schema: 'https://ucp.dev/schemas/shopping/discount.json',
        extends: 'dev.ucp.shopping.checkout',
      },
      {
        name: 'dev.ucp.shopping.order',
        version: UCP_VERSION,
        spec: 'https://ucp.dev/specification/order',
        schema: 'https://ucp.dev/schemas/shopping/order.json',
      },
      {
        name: 'dev.ucp.shopping.ap2_mandate',
        version: UCP_VERSION,
        spec: 'https://ucp.dev/specification/ap2-mandates',
        schema: 'https://ucp.dev/schemas/shopping/ap2_mandate.json',
        extends: 'dev.ucp.shopping.checkout',
      },
    ];
  }

  /**
   * Get available payment handlers
   */
  getPaymentHandlers(): UCPPaymentHandler[] {
    const merchantId = this.configService.get('GOOGLE_PAY_MERCHANT_ID', '');
    const paypalClientId = this.configService.get('PAYPAL_CLIENT_ID', '');
    const stripePublishableKey = this.configService.get('STRIPE_PUBLISHABLE_KEY', '');

    return [
      // Google Pay Handler
      {
        id: 'gpay',
        name: 'com.google.pay',
        version: UCP_VERSION,
        spec: 'https://pay.google.com/gp/p/ucp/2026-01-11/',
        config_schema: 'https://pay.google.com/gp/p/ucp/2026-01-11/schemas/config.json',
        instrument_schemas: [
          'https://pay.google.com/gp/p/ucp/2026-01-11/schemas/card_payment_instrument.json',
        ],
        config: {
          api_version: 2,
          api_version_minor: 0,
          environment: this.configService.get('NODE_ENV') === 'production' ? 'PRODUCTION' : 'TEST',
          merchant_info: {
            merchant_name: 'Agentrix',
            merchant_id: merchantId,
            merchant_origin: 'agentrix.io',
          },
          allowed_payment_methods: [
            {
              type: 'CARD',
              parameters: {
                allowed_auth_methods: ['PAN_ONLY', 'CRYPTOGRAM_3DS'],
                allowed_card_networks: ['VISA', 'MASTERCARD', 'AMEX', 'DISCOVER'],
              },
              tokenization_specification: {
                type: 'PAYMENT_GATEWAY',
                parameters: {
                  gateway: 'stripe',
                  'stripe:version': '2023-10-16',
                  'stripe:publishableKey': stripePublishableKey,
                },
              },
            },
          ],
        },
      },
      // PayPal Handler
      {
        id: 'paypal',
        name: 'com.paypal.checkout',
        version: UCP_VERSION,
        spec: 'https://developer.paypal.com/docs/ucp/',
        config_schema: 'https://developer.paypal.com/schemas/ucp/config.json',
        instrument_schemas: [
          'https://developer.paypal.com/schemas/ucp/paypal_payment_instrument.json',
        ],
        config: {
          client_id: paypalClientId,
          intent: 'CAPTURE',
          currency: 'USD',
          disable_funding: ['credit', 'paylater'],
        },
      },
      // Stripe Direct Tokenizer
      {
        id: 'stripe_tokenizer',
        name: 'com.stripe.tokenizer',
        version: UCP_VERSION,
        spec: 'https://stripe.com/docs/ucp/',
        config_schema: 'https://stripe.com/schemas/ucp/config.json',
        instrument_schemas: [
          'https://ucp.dev/schemas/shopping/types/card_payment_instrument.json',
        ],
        config: {
          publishable_key: stripePublishableKey,
          locale: 'auto',
        },
      },
      // X402 Crypto Handler (Agentrix Native)
      {
        id: 'x402',
        name: 'dev.agentrix.x402',
        version: UCP_VERSION,
        spec: 'https://agentrix.io/docs/ucp/x402',
        config_schema: 'https://agentrix.io/schemas/ucp/x402_config.json',
        instrument_schemas: [
          'https://agentrix.io/schemas/ucp/x402_payment_instrument.json',
        ],
        config: {
          supported_chains: ['ethereum', 'solana', 'base', 'polygon', 'bsc'],
          supported_tokens: ['USDC', 'USDT', 'DAI'],
          payment_address: this.configService.get('X402_PAYMENT_ADDRESS', ''),
        },
      },
    ];
  }

  /**
   * Create a new checkout session
   */
  async createCheckout(dto: CreateCheckoutDto, platformProfile?: string): Promise<UCPCheckoutSession> {
    const sessionId = `chk_${uuidv4().replace(/-/g, '')}`;
    
    // Calculate totals
    const subtotal = dto.line_items.reduce((sum, item) => {
      return sum + (item.item.price * item.quantity);
    }, 0);

    const totals: UCPTotal[] = [
      { type: 'subtotal', amount: subtotal },
      { type: 'tax', amount: 0 }, // Will be calculated based on destination
      { type: 'total', amount: subtotal },
    ];

    const session: UCPCheckoutSession = {
      ucp: {
        version: UCP_VERSION,
        capabilities: this.getSupportedCapabilities().filter(c => !c.extends),
      },
      id: sessionId,
      status: 'incomplete',
      currency: dto.currency || 'USD',
      buyer: dto.buyer,
      line_items: dto.line_items.map((item, index) => ({
        ...item,
        id: item.id || `li_${index + 1}`,
        subtotal: item.item.price * item.quantity,
      })),
      totals,
      payment: {
        handlers: this.getPaymentHandlers(),
      },
      fulfillment: dto.fulfillment,
      links: [
        { rel: 'self', href: `/ucp/v1/checkout-sessions/${sessionId}`, method: 'GET' },
        { rel: 'update', href: `/ucp/v1/checkout-sessions/${sessionId}`, method: 'PUT' },
        { rel: 'complete', href: `/ucp/v1/checkout-sessions/${sessionId}/complete`, method: 'POST' },
        { rel: 'cancel', href: `/ucp/v1/checkout-sessions/${sessionId}/cancel`, method: 'POST' },
      ],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // Persist to database + cache in memory
    this.checkoutSessions.set(sessionId, session);
    await this.persistCheckoutSession(session);

    this.logger.log(`Created UCP checkout session: ${sessionId}`);
    return session;
  }

  /**
   * Get checkout session by ID
   */
  async getCheckout(sessionId: string): Promise<UCPCheckoutSession> {
    // Check in-memory cache first
    let session = this.checkoutSessions.get(sessionId);
    if (session) return session;

    // Fall back to database
    try {
      const entity = await this.checkoutSessionRepository.findOne({ where: { id: sessionId } });
      if (entity) {
        session = this.entityToCheckoutSession(entity);
        this.checkoutSessions.set(sessionId, session); // Warm cache
        return session;
      }
    } catch (e) {
      this.logger.warn(`DB lookup failed for checkout ${sessionId}: ${e.message}`);
    }

    throw new NotFoundException(`Checkout session ${sessionId} not found`);
  }

  /**
   * Update checkout session
   */
  async updateCheckout(sessionId: string, dto: UpdateCheckoutDto): Promise<UCPCheckoutSession> {
    const session = await this.getCheckout(sessionId);
    
    if (session.status === 'complete' || session.status === 'cancelled') {
      throw new BadRequestException(`Cannot update ${session.status} checkout session`);
    }

    // Update buyer info
    if (dto.buyer) {
      session.buyer = { ...session.buyer, ...dto.buyer };
    }

    // Update line items if provided
    if (dto.line_items) {
      session.line_items = dto.line_items;
      // Recalculate totals
      const subtotal = dto.line_items.reduce((sum, item) => {
        return sum + (item.item.price * item.quantity);
      }, 0);
      session.totals = [
        { type: 'subtotal', amount: subtotal },
        { type: 'tax', amount: this.calculateTax(subtotal, dto.fulfillment) },
        { type: 'total', amount: subtotal + this.calculateTax(subtotal, dto.fulfillment) },
      ];
    }

    // Update fulfillment
    if (dto.fulfillment) {
      session.fulfillment = dto.fulfillment;
      // Add shipping cost to totals if applicable
      const shippingCost = this.calculateShippingCost(dto.fulfillment);
      if (shippingCost > 0) {
        const shippingTotalIndex = session.totals.findIndex(t => t.type === 'shipping');
        if (shippingTotalIndex >= 0) {
          session.totals[shippingTotalIndex].amount = shippingCost;
        } else {
          session.totals.splice(-1, 0, { type: 'shipping', amount: shippingCost });
        }
        // Recalculate total
        const total = session.totals.filter(t => t.type !== 'total').reduce((sum, t) => sum + t.amount, 0);
        const totalIndex = session.totals.findIndex(t => t.type === 'total');
        if (totalIndex >= 0) {
          session.totals[totalIndex].amount = total;
        }
      }
    }

    // Check if ready for complete
    session.status = this.checkReadyForComplete(session) ? 'ready_for_complete' : 'incomplete';
    session.updated_at = new Date().toISOString();

    this.checkoutSessions.set(sessionId, session);
    await this.persistCheckoutSession(session);
    return session;
  }

  /**
   * Complete checkout session (place order)
   */
  async completeCheckout(sessionId: string, dto: CompleteCheckoutDto): Promise<UCPCheckoutSession> {
    const session = await this.getCheckout(sessionId);
    
    if (session.status === 'complete') {
      return session; // Idempotent
    }
    
    if (session.status === 'cancelled') {
      throw new BadRequestException('Cannot complete cancelled checkout');
    }

    // Validate payment data
    const handler = session.payment?.handlers.find(h => h.id === dto.payment_data.handler_id);
    if (!handler) {
      throw new BadRequestException(`Unknown payment handler: ${dto.payment_data.handler_id}`);
    }

    try {
      // Process payment based on handler type
      const paymentResult = await this.processPayment(handler, dto.payment_data, session);
      
      if (!paymentResult.success) {
        session.status = 'requires_escalation';
        session.messages = [{
          type: 'error',
          code: paymentResult.errorCode || 'payment_failed',
          content: paymentResult.errorMessage || 'Payment processing failed',
          severity: 'requires_buyer_input',
        }];
        if (paymentResult.continueUrl) {
          session.continue_url = paymentResult.continueUrl;
        }
        this.checkoutSessions.set(sessionId, session);
        await this.persistCheckoutSession(session);
        return session;
      }

      // Create order
      const orderId = await this.createOrder(session, dto.payment_data);
      
      session.status = 'complete';
      session.merchant_order_id = orderId;
      session.updated_at = new Date().toISOString();
      session.messages = [{
        type: 'info',
        code: 'order_placed',
        content: `Order ${orderId} has been placed successfully`,
        severity: 'info',
      }];

      this.checkoutSessions.set(sessionId, session);
      await this.persistCheckoutSession(session);
      this.logger.log(`Completed UCP checkout session: ${sessionId}, order: ${orderId}`);
      
      return session;
    } catch (error) {
      this.logger.error(`Failed to complete checkout ${sessionId}:`, error);
      session.status = 'requires_escalation';
      session.messages = [{
        type: 'error',
        code: 'internal_error',
        content: error.message || 'An unexpected error occurred',
        severity: 'fatal',
      }];
      this.checkoutSessions.set(sessionId, session);
      await this.persistCheckoutSession(session);
      return session;
    }
  }

  /**
   * Cancel checkout session
   */
  async cancelCheckout(sessionId: string, reason?: string): Promise<UCPCheckoutSession> {
    const session = await this.getCheckout(sessionId);
    
    if (session.status === 'complete') {
      throw new BadRequestException('Cannot cancel completed checkout');
    }

    session.status = 'cancelled';
    session.updated_at = new Date().toISOString();
    if (reason) {
      session.messages = [{
        type: 'info',
        code: 'cancelled',
        content: reason,
        severity: 'info',
      }];
    }

    this.checkoutSessions.set(sessionId, session);
    await this.persistCheckoutSession(session);
    this.logger.log(`Cancelled UCP checkout session: ${sessionId}`);
    
    return session;
  }

  // ============ AP2 Mandate Management (DB-backed) ============

  /**
   * Create an AP2 mandate for autonomous agent payments
   */
  async createMandate(dto: CreateMandateDto): Promise<AP2Mandate> {
    const now = new Date();
    const validUntil = dto.valid_until ? new Date(dto.valid_until) : new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const entity = this.mandateRepository.create({
      agentId: dto.agent_id,
      principalId: dto.principal_id,
      maxAmount: String(dto.max_amount),
      currency: dto.currency || 'USD',
      validFrom: now,
      validUntil: validUntil,
      allowedMerchants: dto.allowed_merchants || [],
      allowedCategories: dto.allowed_categories || [],
      usedAmount: '0',
      transactionCount: 0,
      status: MandateStatus.ACTIVE,
    });

    const saved = await this.mandateRepository.save(entity);
    this.logger.log(`Created AP2 mandate: ${saved.id} for agent ${dto.agent_id}`);

    return this.entityToMandate(saved);
  }

  /**
   * Get mandate by ID
   */
  async getMandate(mandateId: string): Promise<AP2Mandate> {
    const entity = await this.mandateRepository.findOne({ where: { id: mandateId } });
    if (!entity) {
      throw new NotFoundException(`Mandate ${mandateId} not found`);
    }
    return this.entityToMandate(entity);
  }

  /**
   * Verify mandate validity and limits
   */
  async verifyMandate(mandateId: string, amount: number, merchantId?: string, category?: string): Promise<MandateVerificationResult> {
    const entity = await this.mandateRepository.findOne({ where: { id: mandateId } });
    if (!entity) {
      return { valid: false, reason: `Mandate ${mandateId} not found` };
    }

    // Check status
    if (entity.status !== MandateStatus.ACTIVE) {
      return { valid: false, reason: `Mandate is ${entity.status}` };
    }

    // Check expiration
    if (entity.validUntil < new Date()) {
      entity.status = MandateStatus.EXPIRED;
      await this.mandateRepository.save(entity);
      return { valid: false, reason: 'Mandate has expired' };
    }

    const maxAmount = Number(entity.maxAmount);
    const usedAmount = Number(entity.usedAmount);

    // Check amount limit
    if (amount > maxAmount) {
      return { valid: false, reason: `Amount ${amount} exceeds mandate limit ${maxAmount}` };
    }

    // Check remaining budget
    if (amount > (maxAmount - usedAmount)) {
      return { valid: false, reason: `Amount ${amount} exceeds remaining budget ${maxAmount - usedAmount}` };
    }

    // Check merchant allowlist
    if (entity.allowedMerchants.length > 0 && merchantId) {
      if (!entity.allowedMerchants.includes(merchantId)) {
        return { valid: false, reason: `Merchant ${merchantId} not in allowed list` };
      }
    }

    // Check category allowlist
    if (entity.allowedCategories.length > 0 && category) {
      if (!entity.allowedCategories.includes(category)) {
        return { valid: false, reason: `Category ${category} not in allowed list` };
      }
    }

    return { valid: true, remaining_amount: maxAmount - usedAmount };
  }

  /**
   * Use mandate for a transaction
   */
  async useMandate(mandateId: string, amount: number): Promise<{ success: boolean; mandate: AP2Mandate }> {
    const entity = await this.mandateRepository.findOne({ where: { id: mandateId } });
    if (!entity) throw new NotFoundException(`Mandate ${mandateId} not found`);
    const verification = await this.verifyMandate(mandateId, amount);

    if (!verification.valid) {
      throw new BadRequestException(verification.reason);
    }

    entity.usedAmount = String(Number(entity.usedAmount) + amount);
    entity.transactionCount += 1;

    const maxAmount = Number(entity.maxAmount);
    if (Number(entity.usedAmount) >= maxAmount) {
      entity.status = MandateStatus.EXHAUSTED;
    }

    await this.mandateRepository.save(entity);
    this.logger.log(`Used mandate ${mandateId}: ${amount}, total used: ${entity.usedAmount}`);

    return { success: true, mandate: this.entityToMandate(entity) };
  }

  /**
   * Revoke mandate
   */
  async revokeMandate(mandateId: string): Promise<AP2Mandate> {
    const entity = await this.mandateRepository.findOne({ where: { id: mandateId } });
    if (!entity) throw new NotFoundException(`Mandate ${mandateId} not found`);
    
    entity.status = MandateStatus.REVOKED;
    await this.mandateRepository.save(entity);
    this.logger.log(`Revoked mandate: ${mandateId}`);

    return this.entityToMandate(entity);
  }

  // ============ Identity Linking ============

  /**
   * In-memory identity links (in production, use database)
   */
  private identityLinks = new Map<string, IdentityLink>();

  /**
   * Link a UCP buyer identity to an Agentrix user
   */
  async linkIdentity(dto: LinkIdentityDto): Promise<IdentityLink> {
    const linkId = `link_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
    const now = new Date().toISOString();

    const link: IdentityLink = {
      id: linkId,
      ucp_buyer_email: dto.ucp_buyer_email,
      agentrix_user_id: dto.agentrix_user_id,
      linked_at: now,
      verified: false,
      verification_method: dto.verification_method,
      metadata: dto.metadata || {},
    };

    this.identityLinks.set(linkId, link);
    this.logger.log(`Created identity link: ${linkId} (${dto.ucp_buyer_email} -> ${dto.agentrix_user_id})`);

    return link;
  }

  /**
   * Find Agentrix user ID by UCP buyer email
   */
  async findLinkedUser(ucpBuyerEmail: string): Promise<string | null> {
    for (const link of this.identityLinks.values()) {
      if (link.ucp_buyer_email === ucpBuyerEmail && link.verified) {
        return link.agentrix_user_id;
      }
    }
    return null;
  }

  /**
   * Find UCP buyer email by Agentrix user ID
   */
  async findLinkedBuyer(agentrixUserId: string): Promise<string | null> {
    for (const link of this.identityLinks.values()) {
      if (link.agentrix_user_id === agentrixUserId && link.verified) {
        return link.ucp_buyer_email;
      }
    }
    return null;
  }

  /**
   * Verify identity link
   */
  async verifyIdentityLink(linkId: string, verificationData: any): Promise<IdentityLink> {
    const link = this.identityLinks.get(linkId);
    if (!link) {
      throw new NotFoundException(`Identity link ${linkId} not found`);
    }

    // In production, implement actual verification logic
    // e.g., email verification, OAuth handshake, etc.
    link.verified = true;
    link.verified_at = new Date().toISOString();

    this.identityLinks.set(linkId, link);
    this.logger.log(`Verified identity link: ${linkId}`);

    return link;
  }

  /**
   * Revoke identity link
   */
  async revokeIdentityLink(linkId: string): Promise<IdentityLink> {
    const link = this.identityLinks.get(linkId);
    if (!link) {
      throw new NotFoundException(`Identity link ${linkId} not found`);
    }

    link.verified = false;
    link.revoked_at = new Date().toISOString();

    this.identityLinks.set(linkId, link);
    this.logger.log(`Revoked identity link: ${linkId}`);

    return link;
  }

  /**
   * List identity links for a user
   */
  async listIdentityLinks(agentrixUserId: string): Promise<IdentityLink[]> {
    const links: IdentityLink[] = [];
    for (const link of this.identityLinks.values()) {
      if (link.agentrix_user_id === agentrixUserId) {
        links.push(link);
      }
    }
    return links;
  }

  // ============ Platform Capability (Phase 3) ============

  /**
   * Discovered external merchants cache
   */
  private discoveredMerchants = new Map<string, DiscoveredMerchant>();

  /**
   * Discover an external UCP-compatible business
   */
  async discoverMerchant(businessUrl: string): Promise<DiscoveredMerchant> {
    const normalizedUrl = businessUrl.replace(/\/$/, '');
    
    // Check cache first
    const cached = this.discoveredMerchants.get(normalizedUrl);
    if (cached && Date.now() - new Date(cached.discovered_at).getTime() < 3600000) { // 1 hour cache
      return cached;
    }

    try {
      const ucpUrl = `${normalizedUrl}/.well-known/ucp`;
      const response = await fetch(ucpUrl, {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(10000), // 10 second timeout
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const profile = await response.json();

      const merchant: DiscoveredMerchant = {
        id: `merchant_${Buffer.from(normalizedUrl).toString('base64').slice(0, 16)}`,
        url: normalizedUrl,
        name: profile.business?.name || normalizedUrl,
        description: profile.business?.description,
        logo: profile.business?.logo,
        ucp_version: profile.ucp?.version,
        capabilities: profile.ucp?.capabilities?.map((c: any) => c.name) || [],
        payment_handlers: profile.payment?.handlers?.map((h: any) => ({
          id: h.id,
          name: h.name,
        })) || [],
        services: Object.keys(profile.ucp?.services || {}),
        discovered_at: new Date().toISOString(),
        verified: true,
        raw_profile: profile,
      };

      this.discoveredMerchants.set(normalizedUrl, merchant);
      this.logger.log(`Discovered UCP merchant: ${merchant.name} (${normalizedUrl})`);

      return merchant;
    } catch (error) {
      this.logger.warn(`Failed to discover UCP merchant at ${normalizedUrl}: ${error.message}`);
      
      const failedMerchant: DiscoveredMerchant = {
        id: `merchant_${Buffer.from(normalizedUrl).toString('base64').slice(0, 16)}`,
        url: normalizedUrl,
        name: normalizedUrl,
        ucp_version: 'unknown',
        capabilities: [],
        payment_handlers: [],
        services: [],
        discovered_at: new Date().toISOString(),
        verified: false,
        error: error.message,
      };

      return failedMerchant;
    }
  }

  /**
   * Create a checkout session on an external UCP merchant (Platform mode)
   */
  async createExternalCheckout(merchantUrl: string, dto: CreateCheckoutDto): Promise<ExternalCheckoutResult> {
    const merchant = await this.discoverMerchant(merchantUrl);
    
    if (!merchant.verified) {
      return {
        success: false,
        error: 'MERCHANT_NOT_UCP_COMPATIBLE',
        message: `${merchantUrl} is not a verified UCP merchant`,
      };
    }

    try {
      const checkoutEndpoint = `${merchantUrl}/ucp/v1/checkout-sessions`;
      
      const response = await fetch(checkoutEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'X-UCP-Platform': 'Agentrix',
          'X-UCP-Platform-Version': '1.0.0',
        },
        body: JSON.stringify(dto),
        signal: AbortSignal.timeout(30000), // 30 second timeout
      });

      if (!response.ok) {
        const errorBody = await response.text();
        return {
          success: false,
          error: 'CHECKOUT_CREATION_FAILED',
          message: `HTTP ${response.status}: ${errorBody}`,
        };
      }

      const session = await response.json();
      
      return {
        success: true,
        merchant_url: merchantUrl,
        merchant_name: merchant.name,
        session,
      };
    } catch (error) {
      return {
        success: false,
        error: 'NETWORK_ERROR',
        message: error.message,
      };
    }
  }

  /**
   * Get checkout status from external merchant
   */
  async getExternalCheckout(merchantUrl: string, sessionId: string): Promise<ExternalCheckoutResult> {
    try {
      const checkoutEndpoint = `${merchantUrl}/ucp/v1/checkout-sessions/${sessionId}`;
      
      const response = await fetch(checkoutEndpoint, {
        headers: {
          'Accept': 'application/json',
          'X-UCP-Platform': 'Agentrix',
        },
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        return {
          success: false,
          error: 'NOT_FOUND',
          message: `Checkout session ${sessionId} not found at ${merchantUrl}`,
        };
      }

      const session = await response.json();
      return {
        success: true,
        merchant_url: merchantUrl,
        session,
      };
    } catch (error) {
      return {
        success: false,
        error: 'NETWORK_ERROR',
        message: error.message,
      };
    }
  }

  /**
   * Complete checkout on external merchant
   */
  async completeExternalCheckout(merchantUrl: string, sessionId: string, dto: CompleteCheckoutDto): Promise<ExternalCheckoutResult> {
    try {
      const completeEndpoint = `${merchantUrl}/ucp/v1/checkout-sessions/${sessionId}/complete`;
      
      const response = await fetch(completeEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'X-UCP-Platform': 'Agentrix',
        },
        body: JSON.stringify(dto),
        signal: AbortSignal.timeout(60000), // 60 second timeout for payment
      });

      if (!response.ok) {
        const errorBody = await response.text();
        return {
          success: false,
          error: 'PAYMENT_FAILED',
          message: `HTTP ${response.status}: ${errorBody}`,
        };
      }

      const session = await response.json();
      return {
        success: true,
        merchant_url: merchantUrl,
        session,
      };
    } catch (error) {
      return {
        success: false,
        error: 'NETWORK_ERROR',
        message: error.message,
      };
    }
  }

  /**
   * List all discovered merchants
   */
  async listDiscoveredMerchants(): Promise<DiscoveredMerchant[]> {
    return Array.from(this.discoveredMerchants.values());
  }

  /**
   * List mandates for an agent
   */
  async listMandates(agentId: string, status?: string): Promise<AP2Mandate[]> {
    const where: any = { agentId };
    if (status) where.status = status;
    const entities = await this.mandateRepository.find({ where, order: { createdAt: 'DESC' } });
    return entities.map(e => this.entityToMandate(e));
  }

  // ============ Helper Methods ============

  private checkReadyForComplete(session: UCPCheckoutSession): boolean {
    // Check required fields
    if (!session.buyer?.email) return false;
    if (!session.line_items?.length) return false;
    
    // Check fulfillment for physical items
    const hasPhysicalItems = true; // Assume all items are physical for now
    if (hasPhysicalItems && !session.fulfillment?.methods?.length) return false;
    
    return true;
  }

  private calculateTax(subtotal: number, fulfillment?: UCPFulfillment): number {
    // Simple tax calculation - in production, use tax service
    const taxRate = 0.0; // No tax for now
    return Math.round(subtotal * taxRate);
  }

  private calculateShippingCost(fulfillment: UCPFulfillment): number {
    // Get selected shipping option cost
    for (const method of fulfillment.methods || []) {
      for (const group of method.groups || []) {
        if (group.selected_option_id) {
          const option = group.options?.find(o => o.id === group.selected_option_id);
          if (option) {
            const shippingTotal = option.totals?.find(t => t.type === 'total');
            if (shippingTotal) return shippingTotal.amount;
          }
        }
      }
    }
    return 0;
  }

  private async processPayment(
    handler: UCPPaymentHandler,
    paymentData: UCPPaymentData,
    session: UCPCheckoutSession,
  ): Promise<{ success: boolean; errorCode?: string; errorMessage?: string; continueUrl?: string }> {
    const totalAmount = session.totals.find(t => t.type === 'total')?.amount || 0;
    
    switch (handler.name) {
      case 'com.google.pay':
        return this.processGooglePay(paymentData, totalAmount, session.currency);
      
      case 'com.paypal.checkout':
        return this.processPayPal(paymentData, totalAmount, session.currency);
      
      case 'com.stripe.tokenizer':
        return this.processStripe(paymentData, totalAmount, session.currency);
      
      case 'dev.agentrix.x402':
        return this.processX402(paymentData, totalAmount, session.currency);
      
      default:
        return { success: false, errorCode: 'unsupported_handler', errorMessage: `Handler ${handler.name} is not supported` };
    }
  }

  private async processGooglePay(
    paymentData: UCPPaymentData,
    amount: number,
    currency: string,
  ): Promise<{ success: boolean; errorCode?: string; errorMessage?: string }> {
    // Google Pay tokens are processed through the gateway (Stripe in our config)
    // The token should be a base64-encoded payment gateway token
    try {
      // In production, decrypt and process the token via Stripe
      this.logger.log(`Processing Google Pay payment: ${amount / 100} ${currency}`);
      return { success: true };
    } catch (error) {
      return { success: false, errorCode: 'gpay_failed', errorMessage: error.message };
    }
  }

  private async processPayPal(
    paymentData: UCPPaymentData,
    amount: number,
    currency: string,
  ): Promise<{ success: boolean; errorCode?: string; errorMessage?: string }> {
    try {
      // PayPal order capture
      this.logger.log(`Processing PayPal payment: ${amount / 100} ${currency}`);
      return { success: true };
    } catch (error) {
      return { success: false, errorCode: 'paypal_failed', errorMessage: error.message };
    }
  }

  private async processStripe(
    paymentData: UCPPaymentData,
    amount: number,
    currency: string,
  ): Promise<{ success: boolean; errorCode?: string; errorMessage?: string; continueUrl?: string }> {
    try {
      // Stripe payment intent or token charge
      this.logger.log(`Processing Stripe payment: ${amount / 100} ${currency}`);
      // May require 3DS - return continueUrl if needed
      return { success: true };
    } catch (error) {
      return { success: false, errorCode: 'stripe_failed', errorMessage: error.message };
    }
  }

  private async processX402(
    paymentData: UCPPaymentData,
    amount: number,
    currency: string,
  ): Promise<{ success: boolean; errorCode?: string; errorMessage?: string }> {
    try {
      // X402 protocol payment verification
      this.logger.log(`Processing X402 payment: ${amount / 100} ${currency}`);
      // Verify on-chain transaction or authorization
      return { success: true };
    } catch (error) {
      return { success: false, errorCode: 'x402_failed', errorMessage: error.message };
    }
  }

  private async createOrder(session: UCPCheckoutSession, paymentData: UCPPaymentData): Promise<string> {
    const orderId = `ord_${uuidv4().replace(/-/g, '').slice(0, 16)}`;
    
    // Create UCP Order record
    const ucpOrder: UCPOrder = {
      id: orderId,
      checkout_session_id: session.id,
      status: 'pending',
      buyer: session.buyer,
      line_items: session.line_items,
      totals: session.totals,
      currency: session.currency,
      payment_handler: paymentData.handler_id,
      fulfillment: session.fulfillment,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // Store UCP order
    this.ucpOrders.set(orderId, ucpOrder);

    // Try to create internal Agentrix order (best effort)
    try {
      const totalAmount = session.totals.find(t => t.type === 'total')?.amount || 0;
      const firstLineItem = session.line_items[0];
      
      // Only create internal order if we have userId and productId
      if (session.buyer?.email && firstLineItem?.item?.product_id) {
        const internalOrder = await this.orderService.createOrder(
          session.buyer.email, // Use email as userId placeholder
          {
            productId: firstLineItem.item.product_id,
            merchantId: 'agentrix', // Default merchant
            amount: totalAmount,
            currency: session.currency,
            assetType: AssetType.PHYSICAL,
          }
        );
        ucpOrder.internal_order_id = internalOrder.id;
        this.ucpOrders.set(orderId, ucpOrder);
        this.logger.log(`Created internal order ${internalOrder.id} for UCP order ${orderId}`);
      }
    } catch (error) {
      this.logger.warn(`Failed to create internal order for UCP: ${error.message}`);
      // Continue - UCP order is still valid
    }
    
    this.logger.log(`Created UCP order ${orderId} from session ${session.id}`);
    return orderId;
  }

  // ============ Order Management ============

  /**
   * Get UCP order by ID
   */
  async getOrder(orderId: string): Promise<UCPOrder> {
    const order = this.ucpOrders.get(orderId);
    if (!order) {
      throw new NotFoundException(`Order ${orderId} not found`);
    }
    return order;
  }

  /**
   * List UCP orders for a buyer
   */
  async listOrders(buyerEmail: string, status?: string, limit?: number): Promise<UCPOrder[]> {
    const orders: UCPOrder[] = [];
    for (const order of this.ucpOrders.values()) {
      if (order.buyer?.email === buyerEmail) {
        if (!status || order.status === status) {
          orders.push(order);
        }
      }
    }
    // Sort by created_at descending
    orders.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return orders.slice(0, limit || 10);
  }

  /**
   * Update UCP order status
   */
  async updateOrderStatus(orderId: string, status: UCPOrder['status'], tracking?: UCPOrder['tracking']): Promise<UCPOrder> {
    const order = await this.getOrder(orderId);
    order.status = status;
    if (tracking) {
      order.tracking = tracking;
    }
    order.updated_at = new Date().toISOString();
    this.ucpOrders.set(orderId, order);
    this.logger.log(`Updated UCP order ${orderId} status to ${status}`);
    return order;
  }

  /**
   * Get order by checkout session ID
   */
  async getOrderByCheckoutSession(sessionId: string): Promise<UCPOrder | null> {
    for (const order of this.ucpOrders.values()) {
      if (order.checkout_session_id === sessionId) {
        return order;
      }
    }
    return null;
  }

  // ============ Product & Skill Catalog ============

  /**
   * Get UCP Product Catalog - 获取所有支持UCP协议的商品和Skill
   * Returns products and skills formatted as UCP-compliant items
   */
  async getProductCatalog(): Promise<{
    version: string;
    total: number;
    products: any[];
    skills: any[];
  }> {
    const baseUrl = this.configService.get('API_BASE_URL', 'https://api.agentrix.io');

    // Get active products (Product entity doesn't have ucpEnabled field yet)
    const products = await this.productRepository.find({
      where: { 
        status: ProductStatus.ACTIVE,
      },
      relations: ['merchant'],
    });

    // Get UCP-enabled skills
    const skills = await this.skillRepository.find({
      where: { 
        status: SkillStatus.PUBLISHED,
        ucpEnabled: true,
      },
      relations: ['author'],
    });

    // Format products for UCP
    const formattedProducts = products.map(product => ({
      id: product.id,
      type: 'product',
      name: product.name,
      description: product.description,
      price: {
        amount: Number(product.price),
        currency: 'USD',
      },
      merchant: {
        id: product.merchant?.agentrixId || product.merchantId,
        name: product.merchant?.nickname || 'Unknown',
      },
      ucp: {
        enabled: true,
        checkout_endpoint: `${baseUrl}/ucp/v1/checkout-sessions`,
        schema: 'https://ucp.dev/schemas/shopping/product.json',
      },
      metadata: {
        category: product.category,
        product_type: product.productType,
        created_at: product.createdAt,
      },
    }));

    // Format skills for UCP
    const formattedSkills = skills.map(skill => ({
      id: skill.id,
      type: 'skill',
      name: skill.name,
      description: skill.description,
      price: this.formatSkillPrice(skill),
      developer: {
        id: skill.author?.agentrixId || skill.authorId,
        name: skill.author?.nickname || 'Unknown',
      },
      ucp: {
        enabled: true,
        checkout_endpoint: skill.ucpCheckoutEndpoint || `${baseUrl}/ucp/v1/checkout-sessions`,
        schema: 'https://ucp.dev/schemas/shopping/skill.json',
      },
      capability: {
        name: skill.name,
        version: skill.version || '1.0.0',
        category: skill.category,
        input_schema: skill.inputSchema,
        output_schema: skill.outputSchema,
      },
      metadata: {
        category: skill.category,
        tags: skill.tags || [],
        layer: skill.layer,
        created_at: skill.createdAt,
      },
    }));

    return {
      version: UCP_VERSION,
      total: formattedProducts.length + formattedSkills.length,
      products: formattedProducts,
      skills: formattedSkills,
    };
  }

  /**
   * Get UCP Skill Catalog - 专门获取Skill列表
   */
  async getSkillCatalog(): Promise<{
    version: string;
    total: number;
    skills: any[];
  }> {
    const baseUrl = this.configService.get('API_BASE_URL', 'https://api.agentrix.io');

    const skills = await this.skillRepository.find({
      where: { 
        status: SkillStatus.PUBLISHED,
        ucpEnabled: true,
      },
      relations: ['author'],
    });

    const formattedSkills = skills.map(skill => ({
      id: skill.id,
      name: skill.name,
      description: skill.description,
      version: skill.version || '1.0.0',
      category: skill.category,
      pricing: this.formatSkillPrice(skill),
      developer: {
        id: skill.author?.agentrixId || skill.authorId,
        name: skill.author?.nickname || 'Unknown',
      },
      endpoints: {
        ucp_checkout: skill.ucpCheckoutEndpoint || `${baseUrl}/ucp/v1/checkout-sessions`,
        x402_service: skill.x402ServiceEndpoint,
        execute: skill.executor?.endpoint || null,
      },
      schema: {
        input: skill.inputSchema,
        output: skill.outputSchema,
      },
      protocols: {
        ucp: skill.ucpEnabled,
        x402: skill.x402Enabled,
      },
      metadata: {
        tags: skill.tags || [],
        total_calls: skill.callCount || 0,
        rating: skill.rating || 0,
        layer: skill.layer,
        created_at: skill.createdAt,
        updated_at: skill.updatedAt,
      },
    }));

    return {
      version: UCP_VERSION,
      total: formattedSkills.length,
      skills: formattedSkills,
    };
  }

  /**
   * Format skill pricing for UCP response
   */
  private formatSkillPrice(skill: Skill): {
    type: string;
    amount?: number;
    currency?: string;
    details?: any;
  } {
    const pricing = skill.pricing;
    
    if (!pricing || pricing.type === SkillPricingType.FREE) {
      return { type: 'free' };
    }

    switch (pricing.type) {
      case SkillPricingType.PER_CALL:
        return {
          type: 'per_call',
          amount: pricing.pricePerCall || 0,
          currency: pricing.currency || 'USD',
        };
      case SkillPricingType.SUBSCRIPTION:
        return {
          type: 'subscription',
          amount: pricing.pricePerCall || 0, // Subscription uses pricePerCall as monthly price
          currency: pricing.currency || 'USD',
          details: {
            billing_period: 'monthly',
          },
        };
      case SkillPricingType.REVENUE_SHARE:
        return {
          type: 'revenue_share',
          details: {
            commission_rate: pricing.commissionRate || 0,
          },
        };
      default:
        return { type: 'free' };
    }
  }

  // ========== Discovery Methods V2.1 ==========

  /**
   * Find all UCP-enabled products
   */
  async findAllProducts() {
    return this.productRepository.find({
      where: { 
        status: ProductStatus.ACTIVE,
        ucpEnabled: true 
      }
    });
  }

  /**
   * Find all UCP-enabled skills
   */
  async findAllSkills() {
    return this.skillRepository.find({
      where: { 
        status: SkillStatus.PUBLISHED,
        ucpEnabled: true 
      }
    });
  }

  // ============ DB Persistence Helpers ============

  /**
   * Persist checkout session to database
   */
  private async persistCheckoutSession(session: UCPCheckoutSession): Promise<void> {
    try {
      const entity = this.checkoutSessionRepository.create({
        id: session.id,
        status: session.status as CheckoutSessionStatus,
        currency: session.currency,
        buyer: session.buyer as any,
        lineItems: session.line_items,
        totals: session.totals,
        payment: session.payment as any,
        fulfillment: session.fulfillment as any,
        messages: session.messages,
        links: session.links,
        continueUrl: session.continue_url,
        merchantOrderId: session.merchant_order_id,
        ucp: session.ucp as any,
        metadata: { order: session.order, error: session.error },
      });
      await this.checkoutSessionRepository.save(entity);
    } catch (e) {
      this.logger.warn(`Failed to persist checkout session ${session.id}: ${e.message}`);
    }
  }

  /**
   * Convert checkout session entity to DTO
   */
  private entityToCheckoutSession(entity: UCPCheckoutSessionEntity): UCPCheckoutSession {
    return {
      ucp: entity.ucp as any || { version: '2026-01-11', capabilities: [] },
      id: entity.id,
      status: entity.status as any,
      currency: entity.currency,
      buyer: entity.buyer as any,
      line_items: entity.lineItems || [],
      totals: entity.totals || [],
      payment: entity.payment as any,
      fulfillment: entity.fulfillment as any,
      messages: entity.messages,
      links: entity.links,
      continue_url: entity.continueUrl,
      merchant_order_id: entity.merchantOrderId,
      created_at: entity.createdAt?.toISOString(),
      updated_at: entity.updatedAt?.toISOString(),
      order: entity.metadata?.order,
      error: entity.metadata?.error,
    };
  }

  /**
   * Convert AP2 mandate entity to DTO
   */
  private entityToMandate(entity: AP2MandateEntity): AP2Mandate {
    return {
      id: entity.id,
      agent_id: entity.agentId,
      principal_id: entity.principalId,
      max_amount: Number(entity.maxAmount),
      currency: entity.currency,
      valid_from: entity.validFrom?.toISOString(),
      valid_until: entity.validUntil?.toISOString(),
      allowed_merchants: entity.allowedMerchants || [],
      allowed_categories: entity.allowedCategories || [],
      used_amount: Number(entity.usedAmount),
      transaction_count: entity.transactionCount,
      status: entity.status as any,
      created_at: entity.createdAt?.toISOString(),
      updated_at: entity.updatedAt?.toISOString(),
    };
  }
}
