import React from 'react';
import Link from 'next/link';
import { ConsoleLayout } from '../../components/console/ConsoleLayout';

/**
 * Console Billing — bridge page that promotes the existing real Stripe
 * checkout / pricing surfaces until the embedded console subscription
 * widget (R3-8) ships.
 */
export default function ConsoleBilling(): React.ReactElement {
  return (
    <ConsoleLayout title="Billing & Subscription">
      <p style={{ color: '#9aa3b2', marginBottom: 24, fontSize: 14, lineHeight: 1.6 }}>
        Manage your Agentrix subscription, payment methods, and invoices. Embedded
        Stripe portal will land in W23 (R3-8). For now, use the checkout & pricing
        surfaces below.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
        <BillingCard
          title="Choose / Upgrade Plan"
          desc="Compare Free, Pro, Team, Enterprise tiers."
          cta="Open Pricing"
          href="/pricing"
        />
        <BillingCard
          title="One-time Top-up (Stripe)"
          desc="Add credits to your wallet via Stripe."
          cta="Stripe Checkout"
          href="/pay/checkout"
        />
        <BillingCard
          title="Crypto Top-up (USDC / SOL / x402)"
          desc="On-chain top-up routed through the unified payment engine."
          cta="Crypto Checkout"
          href="/pay/x402"
        />
        <BillingCard
          title="Cross-border Payment"
          desc="USD ↔ CNY / EUR / JPY routing."
          cta="Cross-border"
          href="/pay/cross-border"
        />
        <BillingCard
          title="Commission Settlement Demo"
          desc="Commission V4 split-tree + AuditProof preview."
          cta="Open Commission"
          href="/console/wallet/commission"
        />
        <BillingCard
          title="Payment History"
          desc="Past invoices, refunds, and receipts."
          cta="View History"
          href="/pay/success"
        />
      </div>
    </ConsoleLayout>
  );
}

function BillingCard({ title, desc, cta, href }: { title: string; desc: string; cta: string; href: string }): React.ReactElement {
  const isExternal = !href.startsWith('/console');
  const inner = (
    <div style={{ padding: 20, background: '#11141a', border: '1px solid #1f242d', borderRadius: 12, display: 'flex', flexDirection: 'column', gap: 12, height: '100%' }}>
      <div style={{ fontSize: 16, fontWeight: 700 }}>{title}</div>
      <div style={{ color: '#9aa3b2', fontSize: 13, flex: 1, lineHeight: 1.6 }}>{desc}</div>
      <div style={{ color: '#22D3FF', fontSize: 13, fontWeight: 600 }}>
        {cta} {isExternal ? '↗' : '→'}
      </div>
    </div>
  );
  return isExternal ? (
    <a href={href} style={{ textDecoration: 'none' }}>{inner}</a>
  ) : (
    <Link href={href} style={{ textDecoration: 'none' }}>{inner}</Link>
  );
}
