// Agentrix v3 marketing SEO helper.
// Use in pages: const seo = buildSeo({ title, description, path, image }); then render <SeoHead {...seo} />.

export interface MarketingSeo {
  title: string;
  description: string;
  canonical: string;
  ogTitle: string;
  ogDescription: string;
  ogImage: string;
  ogType: 'website' | 'article';
}

const SITE = 'https://agentrix.top';
const DEFAULT_OG = `${SITE}/brand/agentrix-logo-full.png`;

export function buildSeo(input: {
  title: string;
  description: string;
  path: string;
  image?: string;
  type?: 'website' | 'article';
}): MarketingSeo {
  const fullTitle = input.title.includes('Agentrix') ? input.title : `${input.title} · Agentrix`;
  const path = input.path.startsWith('/') ? input.path : `/${input.path}`;
  return {
    title: fullTitle,
    description: input.description,
    canonical: `${SITE}${path === '/' ? '' : path}`,
    ogTitle: fullTitle,
    ogDescription: input.description,
    ogImage: input.image ?? DEFAULT_OG,
    ogType: input.type ?? 'website',
  };
}
