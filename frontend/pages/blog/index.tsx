/**
 * /blog — Blog index (Sprint W-4 Day 3).
 *
 * Lists all entries in `BLOG_POSTS`. Posts are markdown stored in
 * `lib/blog-content/`, rendered at `/blog/[slug]`.
 */
import Head from 'next/head';
import Link from 'next/link';
import type { NextPage } from 'next';
import { Calendar, Tag, ArrowRight } from 'lucide-react';
import { MarketingLayout } from '../../components/marketing/MarketingLayout';
import { buildSeo } from '../../lib/seo';
import { useLocalization } from '../../contexts/LocalizationContext';
import { BLOG_POSTS } from '../../lib/blog-posts';

const BlogIndex: NextPage = () => {
  const { t } = useLocalization();
  const seo = buildSeo({
    title: t({ zh: '博客 · Agentrix', en: 'Blog · Agentrix' }),
    description: t({
      zh: '产品更新、技术深度、生态故事。',
      en: 'Product updates, technical deep-dives, ecosystem stories.',
    }),
    path: '/blog',
  });

  return (
    <MarketingLayout seo={seo}>
      <section className="border-b border-agentrix-inkLine bg-agentrix-ink py-20">
        <div className="container mx-auto max-w-4xl px-6 text-center">
          <h1 className="text-4xl font-extrabold md:text-5xl">{t({ zh: '博客', en: 'Blog' })}</h1>
          <p className="mt-4 text-agentrix-fog">
            {t({ zh: '产品更新、技术深度、生态故事。', en: 'Product updates, technical deep-dives, ecosystem stories.' })}
          </p>
        </div>
      </section>

      <section className="bg-agentrix-ink py-16">
        <div className="container mx-auto max-w-4xl px-6">
          <div className="space-y-6">
            {BLOG_POSTS.map((post) => (
              <Link
                key={post.slug}
                href={`/blog/${post.slug}`}
                className="block rounded-2xl border border-agentrix-inkLine bg-agentrix-inkSoft p-6 transition-all hover:border-agentrix-electric/60 hover:bg-agentrix-inkSoft/80 md:p-8"
              >
                <div className="flex items-start gap-5">
                  <div className="flex-shrink-0 text-4xl md:text-5xl">{post.emoji}</div>
                  <div className="flex-1 min-w-0">
                    <div className="mb-2 flex items-center gap-3 text-xs text-agentrix-mist">
                      <Calendar size={11} className="opacity-70" />
                      <time>{post.date}</time>
                      <span className="opacity-40">·</span>
                      <span>{post.author.name}</span>
                      <span className="opacity-40">·</span>
                      <span>{t(post.author.role)}</span>
                    </div>
                    <h2 className="text-xl font-bold text-white md:text-2xl">{t(post.title)}</h2>
                    <p className="mt-2 text-sm text-agentrix-fog md:text-base leading-relaxed">{t(post.description)}</p>

                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      {post.tags.map((tag) => (
                        <span
                          key={tag}
                          className="inline-flex items-center gap-1 rounded-full border border-agentrix-inkLine bg-white/[0.03] px-2.5 py-0.5 text-[10px] font-semibold text-agentrix-mist"
                        >
                          <Tag size={9} />
                          {tag}
                        </span>
                      ))}
                      <span className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-agentrix-electric">
                        {t({ zh: '阅读全文', en: 'Read post' })} <ArrowRight size={12} />
                      </span>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>

          <div className="mt-12 text-center">
            <p className="text-sm text-agentrix-fog mb-4">
              {t({
                zh: '想第一时间看到新文章？关注我们的社区：',
                en: 'Want updates first? Follow our community:',
              })}
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <a
                href="https://t.me/agentrix"
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full bg-blue-500/20 hover:bg-blue-500/30 border border-blue-400/30 px-5 py-2 text-sm font-medium text-white"
              >
                📨 Telegram
              </a>
              <a
                href="https://discord.gg/agentrix"
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-full bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-400/30 px-5 py-2 text-sm font-medium text-white"
              >
                🎮 Discord
              </a>
            </div>
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
};

export default BlogIndex;
