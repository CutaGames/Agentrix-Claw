import Head from 'next/head';
import { useEffect, useState } from 'react';

/**
 * Phase 5 HW-12.4 — Public ClawCore certification dashboard.
 *
 * Renders the JSON written by scripts/clawcore-cert/build-dashboard.mjs
 * (committed to /public/clawcore-cert.json on every push). Partners use
 * this page to track which cert items they need to fill in for their
 * device class.
 */

interface Item { id: string; title: string; status: 'passed' | 'failed' | 'todo' | 'pending' | 'skipped'; }
interface Group { name: string; total: number; passed: number; failed: number; todo: number; items: Item[]; }
interface Summary {
  generated_at: string;
  total: number; passed: number; failed: number; todo: number;
  groups: Group[];
}

const STATUS_COLORS: Record<string, string> = {
  passed: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
  todo: 'bg-gray-100 text-gray-600',
  pending: 'bg-gray-100 text-gray-600',
  skipped: 'bg-yellow-100 text-yellow-800',
};

export default function CertDashboardPage() {
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/clawcore-cert.json')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);

  return (
    <>
      <Head><title>ClawCore Certification · Agentrix</title></Head>
      <main className="mx-auto max-w-5xl p-8 text-gray-900">
        <h1 className="text-3xl font-bold mb-2" data-testid="cert-title">ClawCore Certification</h1>
        <p className="text-gray-600 mb-6">
          100-item suite covering wire format, replay protection, pairing, OTA, timing, and physical/energy.
          Devices must pass all applicable items to qualify for L3 listing.
        </p>

        {error && (
          <div className="rounded border border-red-200 bg-red-50 p-3 text-red-800 text-sm" data-testid="cert-error">
            Failed to load dashboard: {error}
          </div>
        )}
        {!data && !error && <p data-testid="cert-loading">Loading…</p>}

        {data && (
          <>
            <section className="grid grid-cols-4 gap-3 mb-8" data-testid="cert-summary">
              <Tile label="Total" value={data.total} className="bg-white border" />
              <Tile label="Passed" value={data.passed} className="bg-green-50 border-green-200 border" />
              <Tile label="Failed" value={data.failed} className="bg-red-50 border-red-200 border" />
              <Tile label="To do" value={data.todo} className="bg-gray-50 border" />
            </section>

            <p className="text-xs text-gray-500 mb-4">
              Generated {new Date(data.generated_at).toLocaleString()}.
            </p>

            {data.groups.map((g) => (
              <section key={g.name} className="mb-8" data-testid="cert-group">
                <header className="flex justify-between items-center mb-2">
                  <h2 className="text-xl font-semibold">{g.name}</h2>
                  <span className="text-sm text-gray-500">
                    {g.passed}/{g.total} passed · {g.todo} to do{g.failed ? ` · ${g.failed} failed` : ''}
                  </span>
                </header>
                <ul className="divide-y border rounded text-sm">
                  {g.items.map((it) => (
                    <li key={it.id} className="flex items-center justify-between p-2" data-testid="cert-item">
                      <div>
                        <span className="font-mono text-xs text-gray-500 mr-2">{it.id}</span>
                        <span>{it.title}</span>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded ${STATUS_COLORS[it.status] || 'bg-gray-100'}`}>
                        {it.status}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </>
        )}
      </main>
    </>
  );
}

function Tile({ label, value, className = '' }: { label: string; value: number; className?: string }) {
  return (
    <div className={`rounded p-4 ${className}`}>
      <div className="text-xs uppercase tracking-wide text-gray-500">{label}</div>
      <div className="text-3xl font-bold">{value}</div>
    </div>
  );
}
