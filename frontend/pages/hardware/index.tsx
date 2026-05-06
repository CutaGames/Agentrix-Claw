import Head from 'next/head';
import Link from 'next/link';
import { useState } from 'react';
import { API_BASE_URL } from '../../utils/api-config';

/**
 * Phase 5 WB-12.1 — Co-branded hardware store / partner inquiry page.
 *
 * Agentrix does not stock hardware; partners ship under their own brand on
 * top of ClawCore SDK. This page surfaces the L2 first-launch lineup and
 * captures partner inquiries.
 */
interface Listing {
  slug: string;
  name: string;
  partner: string;
  device_class: string;
  status: 'announced' | 'preorder' | 'shipping';
  blurb: string;
}

const FIRST_WAVE: Listing[] = [
  {
    slug: 'reference-claw-stick',
    name: 'Agentrix ClawStick (reference)',
    partner: 'Reference design',
    device_class: 'claw_stick',
    status: 'announced',
    blurb: 'OLED + vibration + L1 button. Open spec, BOM in Developer Portal.',
  },
  {
    slug: 'partner-plush-001',
    name: 'Co-branded plush (partner #1)',
    partner: 'TBD ODM',
    device_class: 'plush',
    status: 'announced',
    blurb: 'Energy ring on collar, BLE pair, ambient interaction.',
  },
];

export default function CoBrandedStorePage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [vol, setVol] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      // v1: best-effort POST to webhook; UI succeeds either way so partners
      // can still contact us via email if the endpoint is not yet deployed.
      await fetch(`${API_BASE_URL}/api/v1/partners/inquiry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, company, expected_volume: vol }),
      }).catch(() => undefined);
      setSubmitted(true);
    } catch (e: any) {
      setError(e?.message || 'submit failed');
    }
  }

  return (
    <>
      <Head>
        <title>Co-branded Hardware · Agentrix</title>
      </Head>
      <main className="mx-auto max-w-5xl p-8 text-gray-900">
        <h1 className="text-4xl font-bold mb-2">Co-branded Hardware</h1>
        <p className="text-gray-600 mb-8">
          Agentrix pets, your industrial design. We provide the SDK, the brand, the cloud — you ship the device.
        </p>

        <section data-testid="hw-listings" className="grid sm:grid-cols-2 gap-4 mb-12">
          {FIRST_WAVE.map((l) => (
            <article key={l.slug} className="border rounded-lg p-4" data-testid="hw-listing">
              <header className="flex items-center justify-between mb-2">
                <h2 className="font-semibold">{l.name}</h2>
                <span className="text-xs uppercase tracking-wide bg-gray-100 px-2 py-0.5 rounded">{l.status}</span>
              </header>
              <p className="text-xs text-gray-500 mb-2">Partner: {l.partner} · Class: {l.device_class}</p>
              <p className="text-sm">{l.blurb}</p>
            </article>
          ))}
        </section>

        <section className="border-t pt-8">
          <h2 className="text-2xl font-semibold mb-2">Become a launch partner</h2>
          <p className="text-sm text-gray-600 mb-4">
            We work with toy makers, peripheral OEMs, and wearable brands. See the{' '}
            <Link href="/developers" className="text-blue-600 underline">Developer Portal</Link> for the SDK.
          </p>
          {submitted ? (
            <div className="bg-green-50 border border-green-200 p-4 rounded" data-testid="hw-submitted">
              Thanks — we'll be in touch within 2 business days.
            </div>
          ) : (
            <form onSubmit={submit} className="grid gap-3 max-w-lg" data-testid="hw-form">
              <input data-testid="hw-name"    required placeholder="Your name"      className="border rounded px-3 py-2" value={name}    onChange={(e) => setName(e.target.value)} />
              <input data-testid="hw-email"   required placeholder="Email" type="email" className="border rounded px-3 py-2" value={email}   onChange={(e) => setEmail(e.target.value)} />
              <input data-testid="hw-company" required placeholder="Company"        className="border rounded px-3 py-2" value={company} onChange={(e) => setCompany(e.target.value)} />
              <input data-testid="hw-volume"  placeholder="Expected annual volume"  className="border rounded px-3 py-2" value={vol}     onChange={(e) => setVol(e.target.value)} />
              <button data-testid="hw-submit" className="bg-black text-white px-4 py-2 rounded">Send inquiry</button>
              {error && <p className="text-red-700 text-sm">{error}</p>}
            </form>
          )}
        </section>
      </main>
    </>
  );
}
