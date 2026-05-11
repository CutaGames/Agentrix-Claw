/**
 * WB-T1.1 / WB-T1.3 — Public pet page SSR + OG meta + unauthenticated access.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';

import PetPublicPage, { getServerSideProps } from '../pages/p/[petId]/index';

const samplePet = {
  pet_id: 'e8fb3375-1505-4d48-bc96-bb0a1f2502e6',
  name: 'Aira',
  soul_template_id: 'claw',
  intimacy_level: 1,
  intimacy_xp: 290,
  primary_agent_id: null as string | null,
  updated_at: 1777894164547,
};
const sampleSoul = {
  id: 'claw',
  clan: 'A_office',
  display_name: '爪爪',
  display_name_en: 'Claw',
  tagline: '日常小事它先来',
  archetype: 'ENFP',
  marketing_hook: '让 Claw 替你接住所有零碎',
  default_idle_emotion: 'happy',
  tier: 'free',
};

describe('WB-T1.1 getServerSideProps', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  it('returns notFound when petId is empty', async () => {
    const r = await getServerSideProps({ params: { petId: '' } } as any);
    expect((r as any).notFound).toBe(true);
  });

  it('returns notFound when backend 404s', async () => {
    (globalThis.fetch as any).mockResolvedValueOnce(new Response('', { status: 404 }));
    const r = await getServerSideProps({ params: { petId: 'missing' } } as any);
    expect((r as any).notFound).toBe(true);
  });

  it('returns props when backend returns pet+soul', async () => {
    (globalThis.fetch as any).mockResolvedValueOnce(
      new Response(JSON.stringify({ pet: samplePet, soul: sampleSoul }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const r = (await getServerSideProps({ params: { petId: samplePet.pet_id } } as any)) as any;
    expect(r.props.pet.name).toBe('Aira');
    expect(r.props.soul.id).toBe('claw');
  });

  it('returns notFound on network error (does not throw)', async () => {
    (globalThis.fetch as any).mockRejectedValueOnce(new Error('boom'));
    const r = await getServerSideProps({ params: { petId: 'x' } } as any);
    expect((r as any).notFound).toBe(true);
  });
});

describe('WB-T1.3 page renders without auth', () => {
  it('renders pet name, intimacy stat, marketing hook (no auth required)', () => {
    const { container } = render(
      <PetPublicPage
        pet={samplePet as any}
        soul={sampleSoul as any}
        activeSkin={null}
        lineage={[]}
      />,
    );
    expect(container.textContent).toContain('Aira');
    expect(container.textContent).toContain('Lv.1');
    expect(container.textContent).toContain('爪爪');
    expect(container.textContent).toContain('让 Claw 替你接住所有零碎');
    expect(container.textContent).not.toMatch(/请登录|sign in|login required/i);
  });

  it('renders gracefully when soul is null (legacy pet)', () => {
    const { container } = render(
      <PetPublicPage pet={samplePet as any} soul={null} activeSkin={null} lineage={[]} />,
    );
    expect(container.textContent).toContain('Aira');
    expect(container.textContent).toContain('Lv.1');
  });
});
