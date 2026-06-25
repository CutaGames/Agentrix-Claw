/**
 * /privacy — Privacy Policy (Sprint W-3 / W-P2-1).
 *
 * Concise privacy policy covering：
 * - 收集的数据（账号 / 设备 / 使用 / 崩溃）
 * - 怎么用 / 不用
 * - 怎么删除 (privacy@agentrix.top)
 * - Cookie 政策（与 CookieConsent 配合）
 * - GDPR / CCPA 兼容声明
 */
import Head from 'next/head';
import Link from 'next/link';
import type { NextPage } from 'next';

const PrivacyPage: NextPage = () => {
  return (
    <>
      <Head>
        <title>隐私政策 · Agentrix</title>
        <meta name="description" content="Agentrix 隐私政策。我们如何收集、使用和保护你的数据。" />
        <meta property="og:title" content="Privacy Policy · Agentrix" />
      </Head>
      <main className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 text-gray-900">
        <div className="max-w-3xl mx-auto px-6 py-16">
          <nav className="text-sm mb-6 text-gray-500">
            <Link href="/" className="hover:underline">首页</Link>
            <span className="mx-2">/</span>
            <span>隐私政策</span>
          </nav>

          <h1 className="text-4xl font-bold mb-2">隐私政策</h1>
          <p className="text-sm text-gray-500 mb-12">最后更新：2026-05-16</p>

          <article className="prose prose-slate max-w-none prose-h2:scroll-mt-20 prose-h2:mt-12 prose-h2:mb-4 prose-h2:text-2xl">
            <p className="lead text-gray-700">
              Agentrix 致力于保护用户隐私。本政策说明我们收集哪些数据、如何使用、用户如何控制。
              如有疑问，请联系 <a href="mailto:privacy@agentrix.top" className="text-violet-600">privacy@agentrix.top</a>。
            </p>

            <h2>1. 我们收集什么</h2>
            <h3>1.1 账户数据（用户主动提供）</h3>
            <ul>
              <li>邮箱地址（用于登录、通知、安全告警）</li>
              <li>钱包地址（当用户用钱包登录时）</li>
              <li>用户名 / 昵称 / 头像（用户主动设置）</li>
              <li>支付信息（仅在购买 Marketplace 商品时，由 Stripe 处理，我们不存储信用卡号）</li>
            </ul>

            <h3>1.2 设备 / 使用数据（默认收集）</h3>
            <ul>
              <li><strong>崩溃报告</strong>：始终收集，仅含设备指纹哈希 (SHA-256) 和脱敏后的栈追踪。文件路径会被替换为 <code>&lt;user&gt;</code>。</li>
              <li><strong>使用遥测</strong>：<strong>默认关闭</strong>。需要用户在设置中主动开启。开启后收集启动 / 登录 / 首次对话等 6 类匿名事件。
                <Link href="/help/desktop" className="ml-1 text-violet-600">详见用户手册 §7</Link>
              </li>
              <li><strong>会话日志</strong>：用户与 AI 的对话内容，用于功能实现（流式返回 / Memory 持久化）。不用于训练第三方模型。</li>
            </ul>

            <h3>1.3 Cookies</h3>
            <ul>
              <li><strong>必要 Cookie</strong>：登录 token（HttpOnly），不可关闭</li>
              <li><strong>语言偏好</strong>：localStorage <code>agentrix_lang</code></li>
              <li><strong>分析 Cookie</strong>：仅在用户同意 Cookie Banner 后启用</li>
            </ul>

            <h2>2. 我们如何使用</h2>
            <ul>
              <li>提供和维护服务（必须）</li>
              <li>检测和修复崩溃 / 安全问题（必须）</li>
              <li>改进产品（仅当用户开启遥测时使用聚合数据，不识别个人）</li>
              <li>合规和法律要求（如反洗钱 / KYC）</li>
            </ul>

            <h2>3. 我们不做什么</h2>
            <ul>
              <li>❌ <strong>不出售用户数据</strong>给第三方</li>
              <li>❌ <strong>不用对话内容</strong>训练我们或他人的 AI 模型（除非用户主动选择"贡献训练数据"）</li>
              <li>❌ <strong>不跟踪</strong>跨站点行为（仅本站 Cookie）</li>
              <li>❌ <strong>不收集</strong>地理位置（除非用户在使用位置相关功能时主动授权）</li>
            </ul>

            <h2>4. 用户控制</h2>
            <h3>4.1 桌面端</h3>
            <p>设置 → Privacy → 「发送匿名使用数据」开关</p>
            <h3>4.2 数据删除</h3>
            <p>发邮件到 <a href="mailto:privacy@agentrix.top" className="text-violet-600">privacy@agentrix.top</a>，
              我们将在 7 天内从生产数据库中删除你的：账户 / 崩溃报告 / 遥测事件。
              对话历史在删除请求 30 天后从备份中清理。
            </p>
            <h3>4.3 数据导出（GDPR Article 20）</h3>
            <p>同上邮箱发请求，30 天内提供 JSON 格式数据归档。</p>

            <h2>5. 数据保留</h2>
            <ul>
              <li>账户数据：账号注销 + 30 天后永久删除</li>
              <li>崩溃报告：90 天后聚合为统计数据，原始记录删除</li>
              <li>遥测事件：90 天</li>
              <li>会话历史：用户主动删除即可，否则保留</li>
            </ul>

            <h2>6. 第三方服务</h2>
            <p>我们使用以下受信任的第三方处理特定功能：</p>
            <ul>
              <li><strong>Stripe</strong> — 信用卡支付</li>
              <li><strong>Cloudflare</strong> — CDN + DDoS 防护</li>
              <li><strong>Anthropic / Google / OpenAI</strong> — AI 模型推理（云端 Tier 时）</li>
            </ul>

            <h2>7. 儿童隐私</h2>
            <p>Agentrix 面向 13 岁及以上用户。如果你是未满 13 岁的用户的家长 / 监护人，
              且发现孩子提供了个人信息，请联系 privacy@agentrix.top，我们将立即删除。</p>

            <h2>8. 政策变更</h2>
            <p>政策更新时我们会通过桌面端通知 + 邮件告知。重大变更（如新增数据收集类别）将在生效 30 天前预告。</p>

            <h2>9. 联系我们</h2>
            <ul>
              <li>邮箱：<a href="mailto:privacy@agentrix.top" className="text-violet-600">privacy@agentrix.top</a></li>
              <li>支持：<a href="mailto:support@agentrix.top" className="text-violet-600">support@agentrix.top</a></li>
            </ul>
          </article>

          <div className="mt-16 pt-6 border-t border-gray-200 flex justify-between text-sm text-gray-500">
            <Link href="/terms" className="text-violet-600 hover:underline">服务条款</Link>
            <Link href="/help" className="text-violet-600 hover:underline">帮助中心 →</Link>
          </div>
        </div>
      </main>
    </>
  );
};

export default PrivacyPage;
