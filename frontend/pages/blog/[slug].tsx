/**
 * /blog/[slug] — Blog post renderer (Sprint W-4 Day 3).
 *
 * Loads markdown from frontend/lib/blog-content/ at static-build time
 * and renders via marked. Mirrors `/help/[...slug]` mechanism.
 */
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { GetStaticPaths, GetStaticProps, NextPage } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { ArrowLeft, Calendar, Tag } from 'lucide-react';
import { marked } from 'marked';
import { MarketingLayout } from '../../components/marketing/MarketingLayout';
import { buildSeo } from '../../lib/seo';
import { BLOG_POSTS, getPostBySlug, type BlogPost } from '../../lib/blog-posts';

interface PageProps {
  post: BlogPost;
  html: string;
}

const BlogPostPage: NextPage<PageProps> = ({ post, html }) => {
  const seo = buildSeo({
    title: post.title.zh,
    description: post.description.zh,
    path: `/blog/${post.slug}`,
  });

  return (
    <MarketingLayout seo={seo}>
      <Head>
        <meta property="og:type" content="article" />
        <meta property="article:published_time" content={post.date} />
        <meta property="article:author" content={post.author.name} />
        {post.tags.map((tag) => (
          <meta key={tag} property="article:tag" content={tag} />
        ))}
      </Head>

      <main className="bg-agentrix-ink py-16">
        <div className="container mx-auto max-w-3xl px-6">
          <Link
            href="/blog"
            className="mb-8 inline-flex items-center gap-2 text-sm text-agentrix-fog hover:text-white"
          >
            <ArrowLeft size={14} />
            返回博客
          </Link>

          <header className="mb-10">
            <div className="mb-3 text-5xl md:text-6xl">{post.emoji}</div>
            <h1 className="text-3xl md:text-4xl font-extrabold text-white leading-tight">
              {post.title.zh}
            </h1>
            <p className="mt-4 text-base text-agentrix-fog leading-relaxed">{post.description.zh}</p>
            <div className="mt-5 flex flex-wrap items-center gap-3 text-xs text-agentrix-mist">
              <span className="inline-flex items-center gap-1.5">
                <Calendar size={11} /> {post.date}
              </span>
              <span className="opacity-40">·</span>
              <span>{post.author.name} · {post.author.role.zh}</span>
              <span className="opacity-40">·</span>
              <div className="inline-flex flex-wrap items-center gap-1.5">
                {post.tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 rounded-full border border-agentrix-inkLine bg-white/[0.03] px-2 py-0.5 text-[10px] font-semibold"
                  >
                    <Tag size={9} />
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </header>

          <article
            className="prose prose-invert prose-violet max-w-none prose-headings:scroll-mt-20 prose-a:text-violet-400 prose-strong:text-white prose-code:text-rose-300 prose-code:before:content-none prose-code:after:content-none prose-pre:bg-black/60 prose-pre:border prose-pre:border-white/10 prose-blockquote:border-l-violet-500 prose-blockquote:text-agentrix-fog prose-h2:mt-12 prose-h3:mt-8"
            dangerouslySetInnerHTML={{ __html: html }}
          />

          <div className="mt-16 pt-8 border-t border-agentrix-inkLine flex flex-wrap items-center gap-4">
            <Link
              href="/blog"
              className="inline-flex items-center gap-2 rounded-full bg-white/10 hover:bg-white/15 px-5 py-2 text-sm font-semibold"
            >
              <ArrowLeft size={14} /> 更多博客
            </Link>
            <Link
              href="/download"
              className="inline-flex items-center gap-2 rounded-full bg-agentrix-electric px-5 py-2 text-sm font-bold text-agentrix-ink hover:opacity-90"
            >
              下载 Agentrix
            </Link>
            <a
              href="https://t.me/agentrix"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-agentrix-inkLine bg-white/5 hover:bg-white/10 px-5 py-2 text-sm font-semibold"
            >
              📨 Telegram
            </a>
          </div>
        </div>
      </main>
    </MarketingLayout>
  );
};

export const getStaticPaths: GetStaticPaths = async () => {
  return {
    paths: BLOG_POSTS.map((p) => ({ params: { slug: p.slug } })),
    fallback: false,
  };
};

export const getStaticProps: GetStaticProps<PageProps> = async (ctx) => {
  const slug = String(ctx.params?.slug ?? '');
  const post = getPostBySlug(slug);
  if (!post) return { notFound: true };

  // Repo root is two dirs up from frontend/pages
  const filePath = path.resolve(process.cwd(), 'lib', 'blog-content', post.contentFile);
  let raw = '';
  try {
    raw = await fs.readFile(filePath, 'utf-8');
  } catch {
    raw = `# ${post.title.zh}\n\n_本文暂时不可用，请稍后再试。_`;
  }

  marked.setOptions({ gfm: true, breaks: false });
  const html = marked.parse(raw) as string;

  return {
    props: { post, html },
    revalidate: 3600,
  };
};

export default BlogPostPage;
