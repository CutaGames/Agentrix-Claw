import React from 'react';
import Link from 'next/link';
import { GetServerSideProps } from 'next';
import { ConsoleLayout } from '../../../components/console/ConsoleLayout';

interface SkillListing {
  id: string;
  title: string;
  description?: string;
  author?: string;
  price?: number | string;
  rating?: number;
  installs?: number;
  tags?: string[];
}

interface PageProps {
  listings: SkillListing[];
  fetched: boolean;
}

export const getServerSideProps: GetServerSideProps<PageProps> = async () => {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL || process.env.BACKEND_URL || 'https://api.agentrix.top';
  try {
    const res = await fetch(`${base.replace(/\/$/, '')}/api/v1/skill-listings?status=published&limit=48`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return { props: { listings: [], fetched: false } };
    const data: unknown = await res.json();
    const arr: any[] = Array.isArray(data)
      ? data
      : (data as { items?: any[]; data?: any[] })?.items ?? (data as { data?: any[] })?.data ?? [];
    const listings: SkillListing[] = arr.map((it: any) => ({
      id: String(it.id ?? it.slug ?? Math.random()),
      title: it.title ?? it.name ?? 'Untitled Skill',
      description: it.description ?? it.summary,
      author: it.author?.displayName ?? it.author ?? it.publisher,
      price: it.price ?? it.priceUsd ?? it.price_usd,
      rating: it.rating ?? it.avg_rating,
      installs: it.installs ?? it.downloads,
      tags: it.tags ?? it.categories,
    }));
    return { props: { listings, fetched: true } };
  } catch {
    return { props: { listings: [], fetched: false } };
  }
};

export default function ConsoleMarketplaceSkills({ listings, fetched }: PageProps): React.ReactElement {
  return (
    <ConsoleLayout title="Skill Marketplace">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <p style={{ color: '#9aa3b2', fontSize: 14, margin: 0 }}>
          Skills published by the OpenClaw / OpenHub developer community.
          Install to teach your Agent new capabilities. Backed by{' '}
          <code>/api/v1/skill-listings</code>.
        </p>
        <Link
          href="/console/developer/skills"
          style={{ padding: '8px 16px', background: '#22D3FF', color: '#07080B', borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: 'none' }}
        >
          + Publish a Skill
        </Link>
      </div>

      {listings.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', background: '#11141a', border: '1px solid #1f242d', borderRadius: 12, color: '#9aa3b2' }}>
          {fetched ? 'No skills published yet — be the first!' : 'Connecting to the Skill marketplace…'}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
          {listings.map((s) => (
            <article key={s.id} style={{ padding: 18, background: '#11141a', border: '1px solid #1f242d', borderRadius: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>{s.title}</h3>
              {s.author && <div style={{ fontSize: 11, color: '#6c7689' }}>@{s.author}</div>}
              {s.description && <div style={{ fontSize: 13, color: '#9aa3b2', lineHeight: 1.55, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{s.description}</div>}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto', paddingTop: 8 }}>
                <span style={{ fontSize: 12, color: '#22D3FF', fontWeight: 600 }}>{s.price != null ? `$${s.price}` : 'Free'}</span>
                {s.installs != null && <span style={{ fontSize: 11, color: '#6c7689' }}>{s.installs} installs</span>}
              </div>
            </article>
          ))}
        </div>
      )}
    </ConsoleLayout>
  );
}
