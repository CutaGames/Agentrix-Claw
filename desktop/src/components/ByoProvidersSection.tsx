import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { API_BASE, apiFetch, useAuthStore } from '../services/store';

interface ProviderDef {
  id: string;
  name: string;
  icon: string;
  billingType?: string;
  supportTier?: 'A' | 'B' | 'C';
  quotaWindowSupport?: string;
  requiredFields: string[];
  optionalFields: string[];
  placeholder: Record<string, string>;
  credentialLabel?: string;
  baseUrl?: string;
  models: Array<{ id: string; label: string }>;
}

interface SavedConfig {
  providerId: string;
  selectedModel: string;
  baseUrl?: string;
  region?: string;
  isDefault: boolean;
  apiKeyPrefix?: string;
  lastTestResult?: string;
  health?: { refreshState?: string; quotaWindow?: { remaining?: number; unit?: string; source?: string } };
}

async function readJson<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const headers = {
    Authorization: `Bearer ${token}`,
    ...(init?.headers as Record<string, string> | undefined),
  };
  const res = await apiFetch(`${API_BASE}${path}`, { ...init, headers });
  const text = await res.text();
  if (!res.ok) throw new Error(text || `HTTP ${res.status}`);
  return text ? JSON.parse(text) as T : [] as T;
}

const TIER_NOTE: Record<string, string> = {
  A: 'Fully supported',
  B: 'Controlled beta — reconnect if the session expires',
  C: 'Compatibility / experimental — may violate upstream terms',
};

export default function ByoProvidersSection() {
  const token = useAuthStore((state) => state.token);
  const [catalog, setCatalog] = useState<ProviderDef[]>([]);
  const [configs, setConfigs] = useState<SavedConfig[]>([]);
  const [keyDraft, setKeyDraft] = useState<Record<string, string>>({});
  const [status, setStatus] = useState('');

  const load = useCallback(async () => {
    if (!token) return;
    const [nextCatalog, nextConfigs] = await Promise.all([
      readJson<ProviderDef[]>('/ai-providers/catalog', token),
      readJson<SavedConfig[]>('/ai-providers/configs', token),
    ]);
    setCatalog(nextCatalog.filter((provider) => provider.billingType !== 'platform'));
    setConfigs(nextConfigs);
  }, [token]);

  useEffect(() => { void load().catch((error) => setStatus(String(error?.message ?? error))); }, [load]);

  if (!token) {
    return (
      <div style={section}>
        <div style={sectionTitle}>Your keys & subscriptions</div>
        <div style={hint}>Sign in to connect personal API keys or subscriptions.</div>
      </div>
    );
  }

  const savedOf = (id: string) => configs.find((row) => row.providerId === id);

  const save = async (provider: ProviderDef) => {
    const existing = savedOf(provider.id);
    const apiKey = keyDraft[provider.id] || (existing ? '__saved__' : '');
    if (!apiKey) {
      setStatus('Enter a credential first');
      return;
    }
    await readJson('/ai-providers/configs', token, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        providerId: provider.id,
        apiKey,
        selectedModel: existing?.selectedModel || provider.models[0]?.id,
        baseUrl: existing?.baseUrl || provider.baseUrl,
      }),
    });
    setKeyDraft((prev) => ({ ...prev, [provider.id]: '' }));
    setStatus(`Saved ${provider.name}. Credential stays on the server.`);
    await load();
  };

  return (
    <div style={section}>
      <div style={sectionTitle}>Your keys & subscriptions</div>
      <div style={hint}>Same contract as Mobile / Web. The picker shows the model and “your key / your subscription”, never the account.</div>
      {catalog.slice(0, 12).map((provider) => {
        const saved = savedOf(provider.id);
        const tier = provider.supportTier ?? 'A';
        const health = saved?.health?.refreshState;
        return (
          <div key={provider.id} style={row}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13 }}>{provider.icon} {provider.name}</div>
              <div style={hint}>
                Tier {tier} · {TIER_NOTE[tier]}
                {saved ? ` · ${saved.apiKeyPrefix ?? '••••'}` : ''}
                {health === 'needs_reauth' ? ' · reconnect required' : ''}
                {provider.quotaWindowSupport && provider.quotaWindowSupport !== 'none'
                  ? ` · window: ${saved?.health?.quotaWindow?.source === 'upstream' && saved.health.quotaWindow.remaining !== undefined
                    ? saved.health.quotaWindow.remaining
                    : 'not published by vendor'}`
                  : ''}
              </div>
            </div>
            <input
              type="password"
              autoComplete="off"
              placeholder={saved ? 'leave blank to keep' : (provider.placeholder.apiKey || 'key')}
              value={keyDraft[provider.id] ?? ''}
              onChange={(event) => setKeyDraft((prev) => ({ ...prev, [provider.id]: event.target.value }))}
              style={input}
            />
            <button style={button} onClick={() => void save(provider).catch((error) => setStatus(String(error?.message ?? error)))}>
              Save
            </button>
          </div>
        );
      })}
      {status ? <div style={{ ...hint, color: 'var(--accent-light)' }}>{status}</div> : null}
    </div>
  );
}

const section: CSSProperties = { marginBottom: 18 };
const sectionTitle: CSSProperties = { fontSize: 12, fontWeight: 600, color: 'var(--text-dim)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.4 };
const hint: CSSProperties = { fontSize: 11, color: 'var(--text-dim)', marginTop: 2 };
const row: CSSProperties = { display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 };
const input: CSSProperties = {
  width: 160,
  padding: '6px 8px',
  background: 'var(--bg-elevated)',
  color: 'var(--text)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  fontSize: 12,
};
const button: CSSProperties = {
  padding: '6px 10px',
  background: 'var(--bg-elevated)',
  color: 'var(--text)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  fontSize: 12,
  cursor: 'pointer',
};
