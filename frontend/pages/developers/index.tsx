import Head from 'next/head';
import Link from 'next/link';

/**
 * Phase 5 HW-12.3 — Developer Portal v1.
 *
 * Public, no-auth landing page for partners building ClawCore-compatible
 * hardware. Sections:
 *   - protocol overview + RFC link
 *   - SDK downloads (placeholder: links to GitHub releases once Phase 5 ships)
 *   - certification flow (100-item suite via /api/v1/clawcore/cert)
 *   - sign-up CTA (mailto for v1; replaced by self-serve form in W12)
 */
export default function DeveloperPortalPage() {
  return (
    <>
      <Head>
        <title>Agentrix Developer Portal · ClawCore</title>
        <meta
          name="description"
          content="Build ClawCore-compatible devices. SDKs, protocol spec, and certification."
        />
      </Head>
      <main className="mx-auto max-w-4xl p-8 text-gray-900">
        <header className="mb-10">
          <h1 className="text-4xl font-bold">ClawCore Developer Portal</h1>
          <p className="mt-2 text-lg text-gray-600">
            Bring Agentrix pets onto your hardware — toys, wearables, controllers, ambient displays.
          </p>
        </header>

        <section className="mb-10" data-testid="dp-protocol">
          <h2 className="text-2xl font-semibold mb-2">1. Protocol</h2>
          <p>
            ClawCore v1 is a 3-layer SDK: Transport (BLE / WS / MQTT) → Protocol (JSON Schemas) → Policy.
          </p>
          <ul className="list-disc list-inside mt-2 text-sm">
            <li>
              <Link href="/docs/RFC_CLAWCORE_PROTOCOL.zh-CN.md" className="text-blue-600 underline">
                RFC: ClawCore Protocol v0 (中文)
              </Link>
            </li>
            <li>
              <a
                href="https://agentrix.top/schemas/clawcore/v1/pet_state.json"
                className="text-blue-600 underline"
              >
                JSON Schema: pet_state.json
              </a>
            </li>
            <li>
              <a
                href="https://agentrix.top/schemas/clawcore/v1/approval_request.json"
                className="text-blue-600 underline"
              >
                JSON Schema: approval_request.json
              </a>
            </li>
          </ul>
        </section>

        <section className="mb-10" data-testid="dp-sdk">
          <h2 className="text-2xl font-semibold mb-2">2. SDKs</h2>
          <table className="w-full text-sm border">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left p-2 border">Surface</th>
                <th className="text-left p-2 border">Language</th>
                <th className="text-left p-2 border">Status</th>
              </tr>
            </thead>
            <tbody>
              <tr><td className="p-2 border">esp32</td><td className="p-2 border">Rust (esp-rs)</td><td className="p-2 border">P5 W10</td></tr>
              <tr><td className="p-2 border">nRF52</td><td className="p-2 border">C (Zephyr)</td><td className="p-2 border">P5 W10</td></tr>
              <tr><td className="p-2 border">Android</td><td className="p-2 border">Kotlin (.aar)</td><td className="p-2 border">P5 W10</td></tr>
              <tr><td className="p-2 border">iOS</td><td className="p-2 border">Swift (.xcframework)</td><td className="p-2 border">P5 W10</td></tr>
              <tr><td className="p-2 border">Desktop</td><td className="p-2 border">Rust (Tauri Bridge)</td><td className="p-2 border">P5 W10</td></tr>
            </tbody>
          </table>
        </section>

        <section className="mb-10" data-testid="dp-cert">
          <h2 className="text-2xl font-semibold mb-2">3. Certification</h2>
          <p>
            Devices must pass the 100-item ClawCore certification suite to qualify for L2 co-brand or
            L3 third-party listings. The suite covers wire format, replay protection, OTA, pairing,
            performance, and energy budget.
          </p>
          <p className="text-sm text-gray-500 mt-2">
            Run locally: <code className="bg-gray-100 px-1">agentrix cert run --device-id &lt;id&gt;</code>
          </p>
        </section>

        <section className="mb-10" data-testid="dp-cta">
          <h2 className="text-2xl font-semibold mb-2">4. Get started</h2>
          <p>
            Email <a className="text-blue-600 underline" href="mailto:partners@agentrix.top">partners@agentrix.top</a>{' '}
            with your device class, target ship date, and intended L2 / L3 tier.
          </p>
        </section>
      </main>
    </>
  );
}
