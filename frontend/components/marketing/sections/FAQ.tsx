/**
 * FAQ — frequently asked questions (8 items).
 */
import { useLocalization } from '../../../contexts/LocalizationContext';
import { ChevronIndicator } from './_shared';

const FAQ_ITEMS = [
  {
    q: { zh: 'Agentrix 是 ChatGPT / Copilot 的替代品吗？', en: 'Is Agentrix a ChatGPT / Copilot replacement?' },
    a: { zh: '不是替代，而是延伸。Agentrix 把 LLM 包装为有人格、有钱包、能跨 5 端协作的 Agent —— 模型仍来自 6 大供应商。', en: 'Not a replacement but an extension. Agentrix wraps LLMs into agents with persona, wallet and 5-surface collaboration. Models still come from 6 providers.' },
  },
  {
    q: { zh: '钱包安全吗？', en: 'Is the wallet safe?' },
    a: { zh: 'MPC 三方分片：Mobile / Server / Recovery。L2/L3 签名永远在 Mobile 端弹窗审批，Web 与 Server 都不持有可独立签名的 share。', en: 'MPC 3-share: Mobile / Server / Recovery. L2/L3 signing always prompts on Mobile. Neither Web nor Server holds an independently usable share.' },
  },
  {
    q: { zh: '什么是 Auto-Earn？', en: 'What is Auto-Earn?' },
    a: { zh: 'Server 端 Agent 7×24 接 Skill / 任务订单，按 X402 协议结算微支付，达到阈值后回流到你的钱包。', en: 'Server-side agents accept Skill / task orders 7×24, settle via X402 micropay and roll up to your wallet on threshold.' },
  },
  {
    q: { zh: '可以在自己的服务器上跑吗？', en: 'Can I self-host?' },
    a: { zh: 'Enterprise 计划支持私有云 / VPC 部署，含 MPC HSM 托管与合规审计。', en: 'Enterprise plan supports private cloud / VPC deployment with MPC HSM custody and compliance audit.' },
  },
  {
    q: { zh: 'AXP 和未来的 AX 代币是什么关系？', en: 'What is the relation between AXP and the upcoming AX token?' },
    a: { zh: 'AXP 是 off-chain 软积分（Phase 1 已上线）。AX 是未来合规就绪后的 ERC-20 治理代币（Phase 3+）。AXP 会按 1:100 固定比例预留 AX 兑换接口，过渡期无缝。', en: 'AXP is an off-chain soft point (Phase 1 live). AX is an ERC-20 governance token planned for Phase 3+ when compliance is ready. AXP is reserved a 1:100 bridge to AX for seamless transition.' },
  },
  {
    q: { zh: '5 档订阅怎么选？', en: 'How to pick among the 5 tiers?' },
    a: { zh: 'Free 适合尝鲜；Lite 解决硬限；Plus 是黄金档（创作者 / 小商户）；Pro 面向全职开发 / 中型商户；Elite 给品牌 KOL / 深度玩家；Enterprise 面向需要 SLA / SOC2 / 私有化的企业。', en: 'Free for tasting; Lite removes hard caps; Plus is the sweet spot (creators / SMBs); Pro for full-time devs / mid merchants; Elite for brand KOLs / power users; Enterprise for SLA / SOC2 / private deployment.' },
  },
  {
    q: { zh: '什么是共养？', en: 'What is co-raising?' },
    a: { zh: '你可以把主宠的共养链接分享给好友，好友每天可喂一次增加能量，好友还能分到主宠未来任务收入的 5%。蚂蚁森林式的轻互动，回访率极高。', en: 'Share a co-raising link with friends. They can feed your pet daily to boost energy, and earn 5% of the pet\'s future task revenue. Ant-Forest-style lightweight interaction with extremely high retention.' },
  },
  {
    q: { zh: '创作者卖皮肤怎么赚钱？', en: 'How do creators earn from selling skins?' },
    a: { zh: '上架皮肤可选一口价 / 拍卖 / 租赁三种模式，并设置 10-50% 的 Remix 分成比例。一旦被他人 Remix 出售，原作者按设定比例持续分账。', en: 'Creators can list skins as fixed-price / auction / rental, and set a 10-50% Remix share. Whenever a Remix of your skin sells, you get that share continuously.' },
  },
];

export function FAQ() {
  const { t } = useLocalization();
  return (
    <section className="bg-agentrix-ink py-20">
      <div className="container mx-auto max-w-3xl px-6">
        <h2 className="mb-10 text-center text-3xl font-bold">
          {t({ zh: '常见问题', en: 'Frequently asked' })}
        </h2>
        <div className="space-y-4">
          {FAQ_ITEMS.map((item) => (
            <details
              key={item.q.en}
              className="group rounded-xl border border-agentrix-inkLine bg-agentrix-inkSoft p-5 open:border-agentrix-electric/40"
            >
              <summary className="flex cursor-pointer items-center justify-between text-base font-semibold text-white">
                <span>{t(item.q)}</span>
                <ChevronIndicator />
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-agentrix-fog">{t(item.a)}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
