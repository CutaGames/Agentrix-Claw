import Link from 'next/link';
import { MarketingLayout } from '../../components/marketing/MarketingLayout';
import { buildSeo } from '../../lib/seo';
import { AI_TOOLS, TOOL_CATEGORIES, type AiTool } from '../../lib/ai-tools-catalog';

/**
 * P1-#6 SEO tool matrix index page.
 * Renders /tools �?30+ tool cards organized by category, each linking to a
 * dedicated /tools/<slug> landing page. Server-side static (no SSR data).
 */
export default function ToolsIndexPage() {
  const seo = buildSeo({
    title: 'AI Tools Directory · 30+ Skills for Every Workflow',
    description:
      'Explore 30+ AI tools from Agentrix �?resume builder, pitch deck maker, phone calls, code review, browser automation, and more. Try free, no credit card.',
    path: '/tools',
  });

  return (
    <MarketingLayout seo={seo}>
      <section className="bg-agentrix-ink pt-16 pb-10 text-center">
        <div className="container mx-auto px-6">
          <span className="rounded-full bg-agentrix-purpleSoft/20 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-agentrix-purpleSoft">
            Skill Marketplace
          </span>
          <h1 className="mt-4 text-4xl font-extrabold md:text-5xl">
            One agent. <span className="text-agentrix-purpleSoft">Every tool.</span>
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-agentrix-fog">
            {AI_TOOLS.length}+ AI skills, all available inside any Agentrix agent. Pick a tool below
            to learn more �?or just open chat and ask.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Link
              href="/agent-builder"
              className="rounded-full bg-agentrix-purpleSoft px-6 py-3 text-sm font-semibold text-white hover:bg-agentrix-purpleSoft/90"
            >
              Try Free
            </Link>
            <Link
              href="/pricing"
              className="rounded-full border border-agentrix-fog/30 px-6 py-3 text-sm font-semibold text-agentrix-fog hover:bg-white/5"
            >
              See Pricing
            </Link>
          </div>
        </div>
      </section>

      <section className="bg-agentrix-ink pb-20">
        <div className="container mx-auto px-6">
          {TOOL_CATEGORIES.map((cat) => {
            const tools = AI_TOOLS.filter((t) => t.category === cat.id);
            if (tools.length === 0) return null;
            return (
              <div key={cat.id} className="mt-12">
                <h2 className="mb-6 flex items-center gap-3 text-2xl font-bold text-white">
                  <span>{cat.emoji}</span>
                  <span>{cat.label}</span>
                  <span className="rounded-full bg-white/5 px-2 py-0.5 text-xs font-normal text-agentrix-fog">
                    {tools.length}
                  </span>
                </h2>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {tools.map((tool) => (
                    <ToolCard key={tool.slug} tool={tool} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </MarketingLayout>
  );
}

function ToolCard({ tool }: { tool: AiTool }) {
  return (
    <Link
      href={`/tools/${tool.slug}`}
      className="group block rounded-xl border border-white/10 bg-white/[0.03] p-5 transition hover:border-agentrix-purpleSoft/50 hover:bg-white/[0.06]"
    >
      <div className="flex items-start gap-3">
        <div className="text-3xl">{tool.icon}</div>
        <div className="flex-1">
          <h3 className="text-base font-semibold text-white group-hover:text-agentrix-purpleSoft">
            {tool.title}
          </h3>
          <p className="mt-1 text-sm text-agentrix-fog/80">{tool.tagline}</p>
        </div>
      </div>
    </Link>
  );
}
