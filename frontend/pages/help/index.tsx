/**
 * /help — Help center index (Sprint W-1).
 */
import Head from 'next/head';
import Link from 'next/link';
import type { NextPage } from 'next';

const HelpIndex: NextPage = () => {
  return (
    <>
      <Head>
        <title>帮助中心 · Agentrix</title>
        <meta name="description" content="Agentrix 用户手册、FAQ、故障排除文档。" />
      </Head>
      <main className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 text-gray-900">
        <div className="max-w-3xl mx-auto px-6 py-16">
          <h1 className="text-4xl font-bold mb-4">帮助中心</h1>
          <p className="text-gray-600 mb-12">
            遇到问题？这里有完整的用户手册和常见问题。
          </p>

          <div className="grid md:grid-cols-2 gap-6">
            <DocCard
              href="/help/desktop"
              title="🖥️ 桌面端用户手册"
              description="安装、悬浮球、Pro Mode、25 个面板、9 个快捷键的完整指南。"
              tag="v0.2.0+"
            />
            <DocCard
              href="/help/mobile"
              title="📱 移动端用户手册"
              description="iOS / Android v1.1.x：邀请码、4-Tab、NFC 盲盒、Toy 配对、扫码绑桌面、OTA 更新。"
              tag="v1.1.0+"
            />
            <DocCard
              href="/help/desktop/faq"
              title="❓ 桌面端 FAQ"
              description="31 条常见问题：安装、登录、浮球、对话、萌宠、自动更新、隐私。"
              tag="31 条"
            />
            <DocCard
              href="/download"
              title="⬇️ 下载 Agentrix"
              description="桌面 / Android APK / iOS（即将上架）"
              tag="多平台"
            />
            <DocCard
              href="https://t.me/agentrix"
              title="💬 Telegram 内测群"
              description="24h 内回复，运营 + 开发同事在群答疑。"
              tag="实时支持"
              external
            />
          </div>

          <div className="mt-12 pt-6 border-t border-gray-200 text-sm text-gray-500">
            <p>
              文档没找到答案？发邮件到 <a href="mailto:support@agentrix.top" className="text-violet-600 hover:underline">support@agentrix.top</a>
              ，24 小时内回复。
            </p>
          </div>
        </div>
      </main>
    </>
  );
};

function DocCard({
  href,
  title,
  description,
  tag,
  external,
}: {
  href: string;
  title: string;
  description: string;
  tag?: string;
  external?: boolean;
}) {
  const content = (
    <div className="block p-6 bg-white rounded-xl border border-gray-200 hover:border-violet-400 hover:shadow-md transition-all">
      <div className="flex items-start justify-between mb-3">
        <h2 className="text-lg font-semibold">{title}</h2>
        {tag && (
          <span className="text-xs px-2 py-0.5 bg-violet-100 text-violet-700 rounded-full">{tag}</span>
        )}
      </div>
      <p className="text-sm text-gray-600 leading-relaxed">{description}</p>
    </div>
  );
  return external ? (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {content}
    </a>
  ) : (
    <Link href={href}>{content}</Link>
  );
}

export default HelpIndex;
