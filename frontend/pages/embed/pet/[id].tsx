import { GetServerSideProps } from 'next';
import Head from 'next/head';

interface Props {
  petId: string;
  theme: 'light' | 'dark';
}

/**
 * Embeddable pet page — Phase 3 W1 WB-T3.6.
 *
 * Renders inside a sandboxed iframe (see /public/embed.js).
 * Minimal UI: pet name + soul badge + Remix CTA → opens Agentrix.
 * Posts agentrix:resize messages to the parent so the host frame can shrink.
 */
export default function EmbedPetPage({ petId, theme }: Props) {
  const isDark = theme === 'dark';
  const bg = isDark ? '#0b1020' : '#ffffff';
  const fg = isDark ? '#f3f4f6' : '#111827';
  const accent = '#8b5cf6';
  return (
    <>
      <Head>
        <title>Agentrix Pet · {petId}</title>
        <meta name="robots" content="noindex,nofollow" />
        <style>{`
          html, body { margin: 0; padding: 0; background: ${bg}; color: ${fg}; font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
          .agentrix-embed-card {
            display: flex; flex-direction: column; align-items: center; justify-content: center;
            padding: 16px; gap: 12px; border-radius: 12px;
          }
          .agentrix-embed-thumb {
            width: 120px; height: 120px; border-radius: 50%;
            background: linear-gradient(135deg, #8b5cf6 0%, #ec4899 100%);
            display: flex; align-items: center; justify-content: center;
            font-size: 40px; color: white;
          }
          .agentrix-embed-title { font-weight: 600; font-size: 14px; }
          .agentrix-embed-soul { font-size: 11px; opacity: 0.7; }
          .agentrix-embed-cta {
            background: ${accent}; color: white; border: 0; padding: 8px 16px;
            border-radius: 8px; font-size: 13px; cursor: pointer; text-decoration: none;
          }
          .agentrix-embed-cta:hover { filter: brightness(1.1); }
        `}</style>
      </Head>
      <div className="agentrix-embed-card" id="agentrix-embed-card">
        <div className="agentrix-embed-thumb" aria-hidden="true">🐾</div>
        <div className="agentrix-embed-title">Agentrix Pet</div>
        <div className="agentrix-embed-soul">#{petId.slice(0, 8)}</div>
        <a
          className="agentrix-embed-cta"
          href={`https://agentrix.top/marketplace/pets/${encodeURIComponent(petId)}?utm_source=embed`}
          target="_top"
          rel="noopener noreferrer"
        >
          Remix on Agentrix →
        </a>
      </div>
      {/* eslint-disable react/no-danger */}
      <script
        dangerouslySetInnerHTML={{
          __html: `
            (function () {
              try {
                var card = document.getElementById('agentrix-embed-card');
                if (!card || !window.parent || window.parent === window) return;
                var rect = card.getBoundingClientRect();
                window.parent.postMessage({
                  type: 'agentrix:resize',
                  width: Math.ceil(rect.width) + 32,
                  height: Math.ceil(rect.height) + 32
                }, '*');
              } catch (e) { /* swallow */ }
            })();
          `,
        }}
      />
    </>
  );
}

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const rawId = String(ctx.params?.id ?? '');
  // Validate id shape defensively (no SSRF / template injection).
  const petId = /^[a-zA-Z0-9._-]{3,128}$/.test(rawId) ? rawId : '';
  if (!petId) {
    return { notFound: true };
  }
  const theme = ctx.query.theme === 'dark' ? 'dark' : 'light';
  // Loosen iframe restrictions so the SDK can embed us anywhere.
  ctx.res.setHeader('X-Frame-Options', 'ALLOWALL');
  ctx.res.setHeader(
    'Content-Security-Policy',
    "frame-ancestors *; default-src 'self' 'unsafe-inline' https://agentrix.top",
  );
  return { props: { petId, theme } };
};
