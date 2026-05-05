import React from 'react';
import Link from 'next/link';

interface ConsoleStubProps {
  description: string;
  eta?: string;
  legacyHref?: string;
  legacyLabel?: string;
}

/**
 * A stub panel for Console pages whose backend is ready but UI is still on the
 * remediation roadmap. Stays inside the ConsoleLayout (does NOT redirect away)
 * and optionally exposes a link to a legacy page that opens in a new tab so the
 * user never feels they "fell out of" the console.
 */
export function ConsoleStub({
  description,
  eta,
  legacyHref,
  legacyLabel,
}: ConsoleStubProps): React.ReactElement {
  return (
    <div>
      <p style={{ color: '#9aa3b2', fontSize: 14, marginBottom: 24, lineHeight: 1.6 }}>
        {description}
      </p>
      <div
        style={{
          padding: 40,
          textAlign: 'center',
          background: '#11141a',
          border: '1px solid #1f242d',
          borderRadius: 12,
          color: '#9aa3b2',
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
          UI in progress{eta ? ` · target ${eta}` : ''}
        </div>
        <div style={{ fontSize: 12, color: '#6c7689', marginBottom: legacyHref ? 20 : 0 }}>
          Backend API is live; frontend wiring is on the remediation plan.
        </div>
        {legacyHref ? (
          <Link
            href={legacyHref}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-block',
              padding: '10px 18px',
              background: 'rgba(34,211,255,0.12)',
              color: '#22D3FF',
              border: '1px solid rgba(34,211,255,0.4)',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            {legacyLabel ?? 'Open legacy page ↗'}
          </Link>
        ) : null}
      </div>
    </div>
  );
}
