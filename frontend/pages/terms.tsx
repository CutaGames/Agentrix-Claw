/**
 * /terms — Terms of Service (Sprint W-3 / W-P2-1).
 */
import Head from 'next/head';
import Link from 'next/link';
import type { NextPage } from 'next';

const TermsPage: NextPage = () => {
  return (
    <>
      <Head>
        <title>服务条款 · Agentrix</title>
        <meta name="description" content="Agentrix 服务条款。使用我们服务前请仔细阅读。" />
        <meta property="og:title" content="Terms of Service · Agentrix" />
      </Head>
      <main className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 text-gray-900">
        <div className="max-w-3xl mx-auto px-6 py-16">
          <nav className="text-sm mb-6 text-gray-500">
            <Link href="/" className="hover:underline">首页</Link>
            <span className="mx-2">/</span>
            <span>服务条款</span>
          </nav>

          <h1 className="text-4xl font-bold mb-2">服务条款</h1>
          <p className="text-sm text-gray-500 mb-12">最后更新：2026-05-16</p>

          <article className="prose prose-slate max-w-none prose-h2:scroll-mt-20 prose-h2:mt-12 prose-h2:mb-4 prose-h2:text-2xl">
            <p className="lead text-gray-700">
              欢迎使用 Agentrix。在使用我们的服务（包括 Web、移动端、桌面端）前，请仔细阅读以下条款。
              使用即表示同意。
            </p>

            <h2>1. 服务定义</h2>
            <p>
              Agentrix 提供 AI Agent 操作系统及相关服务，包括但不限于：
              桌面端 / 移动端 / Web 端的 AI 对话、3D 萌宠 / Skin / Marketplace、
              ClawCore Toy / Glass / Watch 配套硬件支持、Agent Economy 经济系统。
            </p>

            <h2>2. 账户</h2>
            <ul>
              <li>使用 Marketplace / 钱包 / Agent Economy 等高级功能需注册账户</li>
              <li>用户对账户密码安全负责；多次错误登录将临时锁定</li>
              <li>账户不可转让</li>
              <li>未满 13 岁用户禁止注册</li>
            </ul>

            <h2>3. 用户行为</h2>
            <p>使用本服务时，禁止：</p>
            <ul>
              <li>违反任何适用法律 / 法规</li>
              <li>侵犯他人知识产权</li>
              <li>恶意攻击 / 滥用 API（如自动化脚本超出合理限额）</li>
              <li>制造或分发恶意软件</li>
              <li>用 AI 生成违法 / 暴力 / 色情内容</li>
              <li>逆向工程平台核心代码（除非允许的 OSS 部分）</li>
            </ul>

            <h2>4. Marketplace 与创作者</h2>
            <ul>
              <li>用户可上架自创 Skin / 技能 / 任务到 Marketplace</li>
              <li>所有上架内容必须是用户原创或获得合法授权</li>
              <li>违规内容会被下架，账户可能受限</li>
              <li>Remix 时必须遵守原作的 royalty 设置</li>
              <li>平台抽成：Skin 销售额 5-15% (按等级)</li>
            </ul>

            <h2>5. AI 内容</h2>
            <ul>
              <li>AI 输出可能包含不准确或不当信息，仅供参考</li>
              <li>用户对其使用 AI 输出造成的后果负责</li>
              <li>AI 不应用于法律、医疗、财务等需要专业人士的关键决策</li>
            </ul>

            <h2>6. 付款 / 退款</h2>
            <ul>
              <li>订阅按月或按年扣款，可随时取消（不退当期已扣款）</li>
              <li>Marketplace 购买为最终交易，仅在描述严重不符时可退款</li>
              <li>AXP 积分一旦使用不可退；账号注销时未使用积分作废</li>
            </ul>

            <h2>7. 知识产权</h2>
            <ul>
              <li>Agentrix 平台代码、品牌、设计归 Agentrix 所有</li>
              <li>用户上传 / 创建的内容版权归用户；用户授予 Agentrix 在平台内展示和分发的权利</li>
              <li>AI 生成内容版权归促使生成的用户</li>
            </ul>

            <h2>8. 免责声明</h2>
            <p>
              Agentrix 服务"按现状"提供。我们不保证：服务永远不中断 / AI 输出 100% 准确 /
              第三方数据真实性。在法律允许的最大范围内，Agentrix 不承担因服务中断或 AI 错误造成的间接损失。
            </p>

            <h2>9. 服务变更 / 终止</h2>
            <ul>
              <li>我们可能随时更新功能 / 价格，重大变更提前 30 天通知</li>
              <li>违反条款的账户可能被警告 / 限制 / 终止</li>
              <li>账号被终止后用户可申请数据导出（30 天内）</li>
            </ul>

            <h2>10. 法律适用</h2>
            <p>
              本条款受新加坡法律管辖。任何争议通过新加坡国际仲裁中心 (SIAC) 仲裁解决。
            </p>

            <h2>11. 联系</h2>
            <ul>
              <li>商务：<a href="mailto:bd@agentrix.top" className="text-violet-600">bd@agentrix.top</a></li>
              <li>法律：<a href="mailto:legal@agentrix.top" className="text-violet-600">legal@agentrix.top</a></li>
              <li>支持：<a href="mailto:support@agentrix.top" className="text-violet-600">support@agentrix.top</a></li>
            </ul>
          </article>

          <div className="mt-16 pt-6 border-t border-gray-200 flex justify-between text-sm text-gray-500">
            <Link href="/privacy" className="text-violet-600 hover:underline">隐私政策</Link>
            <Link href="/help" className="text-violet-600 hover:underline">帮助中心 →</Link>
          </div>
        </div>
      </main>
    </>
  );
};

export default TermsPage;
