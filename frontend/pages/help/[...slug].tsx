/**
 * /help/[...slug] — Public docs renderer (Sprint W-1).
 *
 * Renders selected `docs/*.md` files at static-time so they're SEO-friendly
 * and don't require a markdown component bundle on the client.
 *
 * Supported slugs:
 *   - /help/desktop      → docs/USER_MANUAL_DESKTOP_V4.zh-CN.md
 *   - /help/desktop/faq  → docs/FAQ_DESKTOP.zh-CN.md
 *
 * @see .kiro/specs/desktop-ga-internal-beta/requirements.md US-G3-6 / US-G3-7
 */
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { GetStaticPaths, GetStaticProps, NextPage } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { marked } from 'marked';

interface Doc {
  slug: string[];
  title: string;
  description: string;
  html: string;
}

interface PageProps {
  doc: Doc;
}

const SITE_BASE = process.env.NEXT_PUBLIC_SITE_URL || 'https://agentrix.top';

// Map URL slug → repo file path.
const DOC_MAP: Record<string, { file: string; title: string; description: string }> = {
  desktop: {
    file: 'docs/USER_MANUAL_DESKTOP_V4.zh-CN.md',
    title: 'Agentrix Desktop 用户手册',
    description: 'Windows 桌面端 v0.2.x 完整使用指南。安装、悬浮球、Pro Mode、25 个面板、9 个快捷键、隐私设置、自动更新、故障排除。',
  },
  'desktop/faq': {
    file: 'docs/FAQ_DESKTOP.zh-CN.md',
    title: 'Agentrix Desktop FAQ',
    description: '31 条常见问题，分 8 类：安装 / 启动 / 登录 / 浮球 / 对话 / 萌宠 / 经济 / 自动更新 / 隐私。',
  },
  mobile: {
    file: 'docs/USER_MANUAL_MOBILE_V4.zh-CN.md',
    title: 'Agentrix Mobile 用户手册',
    description: 'iOS / Android 移动端 v1.1.x 完整使用指南。邀请码、4-Tab 主结构、PetCreator、NFC 盲盒、Toy 配对、扫码绑桌面、隐私与遥测、OTA 更新、故障排除。',
  },
};

const HelpDocPage: NextPage<PageProps> = ({ doc }) => {
  const url = `${SITE_BASE}/help/${doc.slug.join('/')}`;
  return (
    <>
      <Head>
        <title>{doc.title} · Agentrix</title>
        <meta name="description" content={doc.description} />
        <meta property="og:title" content={doc.title} />
        <meta property="og:description" content={doc.description} />
        <meta property="og:type" content="article" />
        <meta property="og:url" content={url} />
        <meta name="twitter:card" content="summary" />
      </Head>
      <main className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 text-gray-900">
        <div className="max-w-3xl mx-auto px-6 py-12">
          {/* Breadcrumb */}
          <nav className="text-sm mb-6 text-gray-500">
            <Link href="/" className="hover:underline">首页</Link>
            <span className="mx-2">/</span>
            <Link href="/help" className="hover:underline">帮助中心</Link>
            {doc.slug.map((s, i) => (
              <span key={i}>
                <span className="mx-2">/</span>
                <span>{s}</span>
              </span>
            ))}
          </nav>

          {/* Markdown rendered content */}
          <article
            className="prose prose-slate max-w-none prose-headings:scroll-mt-20 prose-a:text-violet-600 prose-code:text-rose-700 prose-code:before:content-none prose-code:after:content-none prose-pre:bg-gray-900 prose-pre:text-gray-100"
            dangerouslySetInnerHTML={{ __html: doc.html }}
          />

          {/* Footer nav */}
          <div className="mt-12 pt-6 border-t border-gray-200 flex flex-wrap gap-4 text-sm">
            {doc.slug.join('/') !== 'desktop' && (
              <Link href="/help/desktop" className="text-violet-600 hover:underline">
                ← 桌面端手册
              </Link>
            )}
            {doc.slug.join('/') !== 'mobile' && (
              <Link href="/help/mobile" className="text-violet-600 hover:underline">
                移动端手册
              </Link>
            )}
            {doc.slug.join('/') !== 'desktop/faq' && (
              <Link href="/help/desktop/faq" className="text-violet-600 hover:underline">
                FAQ →
              </Link>
            )}
            <Link href="/download" className="ml-auto text-violet-600 hover:underline">
              下载入口
            </Link>
          </div>
        </div>
      </main>
    </>
  );
};

export const getStaticPaths: GetStaticPaths = async () => {
  const paths = Object.keys(DOC_MAP).map((slug) => ({
    params: { slug: slug.split('/') },
  }));
  return { paths, fallback: 'blocking' };
};

export const getStaticProps: GetStaticProps<PageProps> = async (ctx) => {
  const slugArr = Array.isArray(ctx.params?.slug)
    ? (ctx.params!.slug as string[])
    : ctx.params?.slug
    ? [String(ctx.params.slug)]
    : [];
  const slugKey = slugArr.join('/');
  const meta = DOC_MAP[slugKey];
  if (!meta) return { notFound: true };

  // Repo root is two dirs up from frontend pages
  const repoRoot = path.resolve(process.cwd(), '..');
  const filePath = path.join(repoRoot, meta.file);
  let raw: string;
  try {
    raw = await fs.readFile(filePath, 'utf-8');
  } catch {
    // File not present in build — show short stub
    raw = `# ${meta.title}\n\n_文档暂时不可用，请稍后再试。_`;
  }

  // Strip the leading H1 (we render title in the meta) — keep content
  // Configure marked: GFM tables, breaks, no inline HTML execution
  marked.setOptions({ gfm: true, breaks: false });
  const html = marked.parse(raw) as string;

  return {
    props: {
      doc: {
        slug: slugArr,
        title: meta.title,
        description: meta.description,
        html,
      },
    },
    revalidate: 3600, // re-render every hour if doc changes
  };
};

export default HelpDocPage;
