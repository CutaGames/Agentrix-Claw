import {
  DEVELOPER_ECONOMY_SCHEMA_VERSION,
  DEVELOPER_OFFERING_KIND_MAP_V1,
  commercialModeToEntitlementKind,
  isDisplayableActiveEntitlement,
  isFamilySeatsQuotaMetadata,
  paymentSuccessActivatesEntitlement,
  resellerAdapterSupported,
  sellerListingPublishable,
  validateDeveloperByoConnectionV1,
  validateDeveloperEconomyWebhookEventV1,
  validateDeveloperEntitlementPlanesV1,
  validateDeveloperEntitlementV1,
  validateDeveloperOfferingV1,
  validateDeveloperRecurringPurchaseMandateV1,
  validateDeveloperSeatBindingV1,
  validateDeveloperSellerListingV1,
  type DeveloperByoConnectionV1,
  type DeveloperEntitlementV1,
  type DeveloperOfferingV1,
  type DeveloperRecurringPurchaseMandateV1,
  type DeveloperSeatBindingV1,
  type DeveloperSellerListingV1,
} from "../developer-economy";
import type { RecordRef } from "../trust-loop-primitives";

const T0 = "2026-08-23T10:00:00.000Z";
const T1 = "2026-08-23T10:01:00.000Z";

function ref(type: RecordRef["type"], id: string): RecordRef {
  return { type, id, version: 1 };
}

function offering(
  overrides: Partial<DeveloperOfferingV1> = {},
): DeveloperOfferingV1 {
  return {
    schemaVersion: DEVELOPER_ECONOMY_SCHEMA_VERSION,
    contractType: "developer_offering",
    offeringId: "off_1",
    offeringClass: "ide_subscription",
    discoveryKind: "product",
    commercialMode: "platform_subscription",
    entitlementKind: "subscription",
    vendorRef: ref("provider", "vendor_1"),
    productRef: ref("offering", "prod_1"),
    termsRef: ref("terms", "terms_1"),
    environment: "test",
    regionPolicy: { allowedRegions: ["SG"], blockedRegions: [] },
    seatIdentityPolicy: "independent_user_binding",
    transferPolicy: "non_transferable",
    credentialPlacement: "none",
    resellerAuthorization: "unsupported",
    termsState: "accepted",
    securityState: "passed",
    qualityState: "passed",
    createdAt: T0,
    ...overrides,
  };
}

describe("Developer Economy contracts", () => {
  it("maps six-kind offering classes", () => {
    expect(DEVELOPER_OFFERING_KIND_MAP_V1.ide_subscription).toEqual([
      "product",
      "resource",
    ]);
    expect(DEVELOPER_OFFERING_KIND_MAP_V1.consulting).toEqual([
      "service",
      "task",
    ]);
    expect(DEVELOPER_OFFERING_KIND_MAP_V1.coding_runtime).toEqual(["agent"]);
    expect(commercialModeToEntitlementKind("byo_subscription")).toBe("byo");
    expect(commercialModeToEntitlementKind("team_seat")).toBe("team_seat");
    expect(isFamilySeatsQuotaMetadata("family_seats")).toBe(true);
  });

  it("accepts a valid offering and rejects unknown fields", () => {
    expect(validateDeveloperOfferingV1(offering()).valid).toBe(true);
    expect(
      validateDeveloperOfferingV1({ ...offering(), extra: true }).valid,
    ).toBe(false);
  });

  it("rejects incompatible discovery kind and shared-account seats", () => {
    expect(
      validateDeveloperOfferingV1(
        offering({ offeringClass: "consulting", discoveryKind: "agent" }),
      ).valid,
    ).toBe(false);
    expect(
      validateDeveloperOfferingV1(
        offering({ seatIdentityPolicy: "unsupported_shared_account" }),
      ).valid,
    ).toBe(false);
  });

  it("records unsupported reseller honestly and rejects BYO without desktop storage", () => {
    expect(
      validateDeveloperOfferingV1(
        offering({
          commercialMode: "authorized_reseller",
          entitlementKind: "subscription",
          resellerAuthorization: "unsupported",
        }),
      ).valid,
    ).toBe(true);
    expect(resellerAdapterSupported("unsupported")).toBe(false);
    expect(
      validateDeveloperOfferingV1(
        offering({
          commercialMode: "byo_subscription",
          entitlementKind: "byo",
          credentialPlacement: "none",
        }),
      ).valid,
    ).toBe(false);
  });

  it("keeps payment/provisioning/entitlement orthogonal", () => {
    expect(
      validateDeveloperEntitlementPlanesV1({
        payment: "succeeded",
        provisioning: "provision_pending",
        entitlement: "provision_pending",
        renewal: "current",
        refund: "none",
        dispute: "none",
      }).valid,
    ).toBe(true);
    expect(
      paymentSuccessActivatesEntitlement({
        payment: "succeeded",
        provisioning: "provision_pending",
        entitlement: "active",
        renewal: "current",
        refund: "none",
        dispute: "none",
      }),
    ).toBe(true);
    expect(
      validateDeveloperEntitlementPlanesV1({
        payment: "succeeded",
        provisioning: "provision_pending",
        entitlement: "active",
        renewal: "current",
        refund: "none",
        dispute: "none",
      }).valid,
    ).toBe(false);
    expect(
      isDisplayableActiveEntitlement({
        payment: "succeeded",
        provisioning: "provisioned",
        entitlement: "active",
        renewal: "current",
        refund: "none",
        dispute: "none",
      }),
    ).toBe(true);
  });

  it("rejects entitlement unknown fields and family_seats occupant", () => {
    const row: DeveloperEntitlementV1 = {
      schemaVersion: 1,
      contractType: "developer_entitlement",
      entitlementId: "dent_1",
      ownerUserId: "user_1",
      tenantRef: null,
      offeringRef: ref("offering", "off_1"),
      entitlementKind: "subscription",
      environment: "test",
      planes: {
        payment: "pending",
        provisioning: "not_started",
        entitlement: "quoted",
        renewal: "current",
        refund: "none",
        dispute: "none",
      },
      createdAt: T0,
      updatedAt: T1,
    };
    expect(validateDeveloperEntitlementV1(row).valid).toBe(true);
    expect(validateDeveloperEntitlementV1({ ...row, apiKey: "x" }).valid).toBe(
      false,
    );
  });

  it("validates recurring mandate and BYO without credentials", () => {
    const mandate: DeveloperRecurringPurchaseMandateV1 = {
      schemaVersion: 1,
      contractType: "developer_recurring_purchase_mandate",
      mandateId: "man_1",
      ownerUserId: "user_1",
      tenantRef: null,
      merchantRef: ref("provider", "vendor_1"),
      offeringRef: ref("offering", "off_1"),
      periodCeiling: { amountMinor: "2000", currency: "USD", decimals: 2 },
      currency: "USD",
      cadence: "monthly",
      nextChargeAt: T1,
      expiresAt: "2026-09-23T10:01:00.000Z",
      termsVersion: "terms_1",
      cancellationPath: "/economy/cancel",
      status: "active",
      issuedAt: T0,
    };
    expect(validateDeveloperRecurringPurchaseMandateV1(mandate).valid).toBe(
      true,
    );
    const byo: DeveloperByoConnectionV1 = {
      schemaVersion: 1,
      contractType: "developer_byo_connection",
      connectionId: "byo_1",
      ownerUserId: "user_1",
      tenantRef: null,
      provider: "cursor",
      adapterCapability: {
        adapterRef: "adapter_cursor",
        providerRef: "cursor",
        supportStatus: "supported",
      },
      entitlementRef: ref("credential_status", "dent_1"),
      environment: "test",
      credentialPlacement: "desktop_os_secure_storage",
      lifecycleState: "connected",
      createdAt: T0,
      updatedAt: T1,
    };
    expect(validateDeveloperByoConnectionV1(byo).valid).toBe(true);
    expect(
      validateDeveloperByoConnectionV1({ ...byo, apiKey: "sk-live" }).valid,
    ).toBe(false);
  });

  it("rejects family_seats as a seat identity", () => {
    const seat: DeveloperSeatBindingV1 = {
      schemaVersion: 1,
      contractType: "developer_seat_binding",
      seatId: "seat_1",
      offeringRef: ref("offering", "off_1"),
      entitlementRef: ref("credential_status", "dent_1"),
      occupantUserId: "user_2",
      environment: "test",
      assignedAt: T0,
    };
    expect(validateDeveloperSeatBindingV1(seat).valid).toBe(true);
    expect(
      validateDeveloperSeatBindingV1({
        ...seat,
        occupantUserId: "family_seats",
      }).valid,
    ).toBe(false);
  });

  it("requires seller publish gates and paid refs", () => {
    const listing: DeveloperSellerListingV1 = {
      schemaVersion: 1,
      contractType: "developer_seller_listing",
      listingId: "list_1",
      offeringRef: ref("offering", "off_1"),
      sellerUserId: "seller_1",
      tenantRef: null,
      environment: "test",
      termsState: "accepted",
      securityState: "passed",
      qualityState: "passed",
      fulfilmentRef: ref("execution_record", "ful_1"),
      commissionRef: ref("commission_allocation", "com_1"),
      refundRef: ref("settlement_event", "set_1"),
      disputeRef: ref("dispute_case", "dis_1"),
      publishedAt: T0,
    };
    expect(validateDeveloperSellerListingV1(listing).valid).toBe(true);
    expect(sellerListingPublishable(listing)).toBe(true);
    expect(
      validateDeveloperSellerListingV1({
        ...listing,
        termsState: "draft",
      }).valid,
    ).toBe(false);
    expect(
      validateDeveloperEconomyWebhookEventV1({
        schemaVersion: 1,
        contractType: "developer_economy_webhook_event",
        source: "stripe",
        kind: "purchase",
        eventId: "evt_1",
        eventAt: T0,
        ownerUserId: "user_1",
        tenantRef: null,
        productRef: ref("offering", "price_1"),
        environment: "test",
      }).valid,
    ).toBe(true);
  });
});
