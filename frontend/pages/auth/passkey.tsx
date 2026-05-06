import { useEffect, useState, useCallback } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { API_BASE_URL } from '../../utils/api-config';

/**
 * Phase 4 W8 — WB-T4.1 / WB-T4.2 — Passkey (WebAuthn) registration +
 * authentication for L3 approval co-signing on the web surface.
 *
 * Flow:
 *   register: POST /v1/passkey/register/start  → challenge
 *             navigator.credentials.create()    → attestation
 *             POST /v1/passkey/register/finish  → persisted credential
 *   auth:     POST /v1/passkey/auth/start       → challenge + allow_credentials
 *             navigator.credentials.get()        → assertion
 *             POST /v1/passkey/auth/finish      → assertion_token (use as L3 co-sign)
 */

interface PasskeyItem {
  id: string;
  credential_id: string;
  label: string | null;
  transports: string | null;
  created_at: string;
}

function b64urlToBuf(b64u: string): ArrayBuffer {
  const b64 = b64u.replace(/-/g, '+').replace(/_/g, '/').padEnd(b64u.length + ((4 - (b64u.length % 4)) % 4), '=');
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}
function bufToB64url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export default function PasskeyPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [items, setItems] = useState<PasskeyItem[]>([]);
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const ok = !!(window.PublicKeyCredential && navigator.credentials);
      setSupported(ok);
    }
    const t = (typeof window !== 'undefined' && localStorage.getItem('access_token')) || null;
    if (!t) {
      router.replace('/login');
      return;
    }
    setToken(t);
  }, [router]);

  const headers = useCallback(
    () => ({
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    }),
    [token],
  );

  const refresh = useCallback(async () => {
    if (!token) return;
    const r = await fetch(`${API_BASE_URL}/api/v1/passkey`, { headers: headers() });
    if (r.ok) setItems((await r.json()).items ?? []);
  }, [token, headers]);

  useEffect(() => {
    if (token) refresh();
  }, [token, refresh]);

  async function register() {
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      const startRes = await fetch(`${API_BASE_URL}/api/v1/passkey/register/start`, {
        method: 'POST',
        headers: headers(),
      });
      if (!startRes.ok) throw new Error(`start failed: ${startRes.status}`);
      const start = await startRes.json();
      const cred = (await navigator.credentials.create({
        publicKey: {
          challenge: b64urlToBuf(start.challenge),
          rp: { id: start.rpId, name: start.rpName },
          user: {
            id: new TextEncoder().encode(token!.slice(0, 32)),
            name: 'agentrix-user',
            displayName: 'Agentrix User',
          },
          pubKeyCredParams: [
            { type: 'public-key', alg: -7 }, // ES256
            { type: 'public-key', alg: -257 }, // RS256
          ],
          authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' },
          timeout: 60_000,
          attestation: 'none',
        },
      })) as PublicKeyCredential | null;
      if (!cred) throw new Error('no credential returned');
      const att = cred.response as AuthenticatorAttestationResponse;
      const body = {
        credential_id: cred.id, // already base64url-ish
        public_key: bufToB64url(att.getPublicKey?.() ?? new ArrayBuffer(0)),
        client_data_json: bufToB64url(att.clientDataJSON),
        label: label || `Web ${new Date().toLocaleDateString()}`,
        transports: (att.getTransports?.() || []).join(','),
      };
      const finishRes = await fetch(`${API_BASE_URL}/api/v1/passkey/register/finish`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify(body),
      });
      if (!finishRes.ok) throw new Error(`finish failed: ${(await finishRes.json()).message ?? finishRes.status}`);
      setInfo('Passkey registered ✓');
      setLabel('');
      await refresh();
    } catch (e: any) {
      setError(e.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  async function authenticate() {
    setError(null);
    setInfo(null);
    setBusy(true);
    try {
      const startRes = await fetch(`${API_BASE_URL}/api/v1/passkey/auth/start`, {
        method: 'POST',
        headers: headers(),
      });
      if (!startRes.ok) throw new Error(`auth start failed: ${startRes.status}`);
      const start = await startRes.json();
      const assertion = (await navigator.credentials.get({
        publicKey: {
          challenge: b64urlToBuf(start.challenge),
          allowCredentials: (start.allow_credentials || []).map((id: string) => ({
            id: b64urlToBuf(id),
            type: 'public-key',
          })),
          userVerification: 'preferred',
          timeout: 60_000,
        },
      })) as PublicKeyCredential | null;
      if (!assertion) throw new Error('no assertion');
      const r = assertion.response as AuthenticatorAssertionResponse;
      const finishRes = await fetch(`${API_BASE_URL}/api/v1/passkey/auth/finish`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({
          credential_id: assertion.id,
          client_data_json: bufToB64url(r.clientDataJSON),
          authenticator_data: bufToB64url(r.authenticatorData),
          signature: bufToB64url(r.signature),
        }),
      });
      if (!finishRes.ok) throw new Error(`auth finish failed: ${(await finishRes.json()).message ?? finishRes.status}`);
      const out = await finishRes.json();
      setInfo(`Authenticated ✓ assertion_token=${out.assertion_token.slice(0, 18)}…`);
    } catch (e: any) {
      setError(e.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!confirm('Remove this passkey?')) return;
    await fetch(`${API_BASE_URL}/api/v1/passkey/${id}`, { method: 'DELETE', headers: headers() });
    refresh();
  }

  return (
    <>
      <Head><title>Passkey · Agentrix</title></Head>
      <div className="mx-auto max-w-3xl p-8">
        <h1 className="text-2xl font-bold mb-2" data-testid="pk-title">Passkey 管理</h1>
        <p className="text-sm text-gray-500 mb-6">
          注册 Passkey 后可在 L3 审批中作为 Web 协签端使用（WB-T4.1 / WB-T4.2）。
        </p>

        {!supported && (
          <div className="rounded bg-yellow-50 border border-yellow-300 p-3 text-yellow-900 text-sm mb-4" data-testid="pk-unsupported">
            当前浏览器不支持 WebAuthn / Passkey。
          </div>
        )}

        <div className="border rounded p-4 mb-6">
          <h2 className="font-semibold mb-2">注册新 Passkey</h2>
          <div className="flex gap-2">
            <input
              data-testid="pk-label"
              className="border rounded px-2 py-1 flex-1"
              placeholder="设备名（可选，例如 MacBook Air）"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
            <button
              data-testid="pk-register"
              disabled={busy || !supported}
              onClick={register}
              className="bg-black text-white px-4 py-1 rounded disabled:opacity-50"
            >注册</button>
          </div>
        </div>

        <div className="border rounded p-4 mb-6">
          <h2 className="font-semibold mb-2">使用 Passkey 验证（L3 协签）</h2>
          <button
            data-testid="pk-authenticate"
            disabled={busy || !supported || items.length === 0}
            onClick={authenticate}
            className="bg-blue-600 text-white px-4 py-1 rounded disabled:opacity-50"
          >验证</button>
          {items.length === 0 && (
            <p className="text-sm text-gray-500 mt-2" data-testid="pk-none">尚未注册 Passkey。</p>
          )}
        </div>

        {error && (
          <div className="rounded bg-red-50 border border-red-300 p-3 text-red-900 text-sm mb-4" data-testid="pk-error">
            {error}
          </div>
        )}
        {info && (
          <div className="rounded bg-green-50 border border-green-300 p-3 text-green-900 text-sm mb-4" data-testid="pk-info">
            {info}
          </div>
        )}

        <h2 className="font-semibold mb-2">已注册</h2>
        <ul className="divide-y border rounded" data-testid="pk-list">
          {items.map((it) => (
            <li key={it.id} className="flex justify-between items-center p-3" data-testid="pk-item">
              <div>
                <div className="font-mono text-xs text-gray-600">{it.credential_id.slice(0, 16)}…</div>
                <div className="text-sm">{it.label || '(no label)'} · {new Date(it.created_at).toLocaleDateString()}</div>
              </div>
              <button
                onClick={() => remove(it.id)}
                className="text-red-600 text-sm"
                data-testid="pk-remove"
              >Remove</button>
            </li>
          ))}
          {items.length === 0 && (
            <li className="p-3 text-sm text-gray-500">No passkeys yet.</li>
          )}
        </ul>
      </div>
    </>
  );
}
