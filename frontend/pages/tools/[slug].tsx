import type { GetStaticPaths, GetStaticProps } from 'next';
import Link from 'next/link';
import { MarketingLayout } from '../../components/marketing/MarketingLayout';
import { buildSeo } from '../../lib/seo';
import { AI_TOOLS, TOOL_CATEGORIES, getToolBySlug, type AiTool } from '../../lib/ai-tools-catalog';

interface Props {
  tool: AiTool;
  related: AiTool[];
}

/**
 * P1-#6 Per-tool SEO landing page.
 * One page per tool, statically generated at build time. Each page targets one
 * keyword cluster (ai-resume, ai-pitch-deck, etc.).
 */
export default function ToolPage({ tool, related }: Props) {
  const cat = TOOL_CATEGORIES.find((c) => c.id === tool.category);
  const seo = buildSeo({
    title: `${tool.title} · ${tool.tagline}`,
    description: tool.description,
    path: `/tools/${tool.slug}`,
  });

  return (
    <MarketingLayout seo={seo}>
      <section className="bg-agentrix-ink pt-16 pb-12">
        <div className="container mx-auto px-6">
          <nav className="mb-6 text-sm text-agentrix-fog/70">
            <Link href="/tools" className="hover:text-white">
              Tools
            </Link>
            <span className="mx-2">/</span>
            <span className="text-white">{tool.title}</span>
          </nav>

          <div className="grid items-start gap-10 md:grid-cols-[1fr_320px]">
            <div>
              <div className="flex items-center gap-3">
                <span className="text-5xl">{tool.icon}</span>
                <span className="rounded-full bg-agentrix-purpleSoft/15 px-3 py-1 text-xs font-semibold text-agentrix-purpleSoft">
                  {cat?.label ?? tool.category}
                </span>
              </div>
              <h1 className="mt-4 text-4xl font-extrabold text-white md:text-5xl">{tool.title}</h1>
              <p className="mt-3 text-xl text-agentrix-fog">{tool.tagline}</p>

              <p className="mt-6 text-base leading-relaxed text-agentrix-fog/90">{tool.intro}</p>

              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  href={`/agent-builder?tool=${tool.slug}`}
                  className="rounded-full bg-agentrix-purpleSoft px-6 py-3 text-sm font-semibold text-white hover:bg-agentrix-purpleSoft/90"
                >
                  Try {tool.title} Free
                </Link>
                <Link
                  href="/download"
                  className="rounded-full border border-agentrix-fog/30 px-6 py-3 text-sm font-semibold text-agentrix-fog hover:bg-white/5"
                >
                  Get Desktop App
                </Link>
              </div>
            </div>

            <aside className="rounded-xl border border-white/10 bg-white/[0.03] p-6">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-agentrix-fog/70">
                Try this prompt
              </h2>
              <p className="mt-3 rounded-lg bg-black/40 p-4 font-mono text-sm leading-relaxed text-white">
                {tool.examplePrompt}
              </p>
              <div className="mt-4 text-xs text-agentrix-fog/70">
                <span className="font-semibold text-agentrix-fog/90">Powered by:</span>{' '}
                <code className="rounded bg-black/40 px-1.5 py-0.5">{tool.poweredBy}</code>
              </div>
            </aside>
          </div>
        </div>
      </section>

      <section className="bg-agentrix-ink pb-12">
        <div className="container mx-auto px-6">
          <h2 className="mb-6 text-2xl font-bold text-white">What you get</h2>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {tool.bullets.map((b, i) => (
              <li
                key={i}
                className="flex items-start gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-4"
              >
                <span className="text-agentrix-purpleSoft">{'\u2713'}</span>
                <span className="text-sm text-agentrix-fog/90">{b}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {related.length > 0 && (
        <section className="bg-agentrix-ink pb-20">
          <div className="container mx-auto px-6">
            <h2 className="mb-6 text-2xl font-bold text-white">Related tools</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {related.map((r) => (
                <Link
                  key={r.slug}
                  href={`/tools/${r.slug}`}
                  className="group block rounded-xl border border-white/10 bg-white/[0.03] p-5 transition hover:border-agentrix-purpleSoft/50"
                >
                  <div className="flex items-start gap-3">
                    <div className="text-2xl">{r.icon}</div>
                    <div>
                      <h3 className="text-base font-semibold text-white group-hover:text-agentrix-purpleSoft">
                        {r.title}
                      </h3>
                      <p className="mt-1 text-xs text-agentrix-fog/80">{r.tagline}</p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
            <div className="mt-8 text-center">
              <Link
                href="/tools"
                className="text-sm text-agentrix-purpleSoft hover:underline"
              >
                {'\u2190'} Back to all tools
              </Link>
            </div>
          </div>
        </section>
      )}
    </MarketingLayout>
  );
}

export const getStaticPaths: GetStaticPaths = async () => ({
  paths: AI_TOOLS.map((t) => ({ params: { slug: t.slug } })),
  fallback: false,
});

export const getStaticProps: GetStaticProps<Props> = async (ctx) => {
  const slug = ctx.params?.slug as string;
  const tool = getToolBySlug(slug);
  if (!tool) return { notFound: true };
  const related = AI_TOOLS.filter((t) => t.category === tool.category && t.slug !== slug).slice(0, 3);
  return { props: { tool, related } };
};
