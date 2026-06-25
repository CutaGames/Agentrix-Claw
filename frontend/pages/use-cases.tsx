/**
 * /use-cases — Real-world scenarios (Sprint W-4 Day 4 expansion).
 *
 * Replaces the 3-card placeholder with 6 concrete personas, each with:
 *   - a one-sentence pitch
 *   - a "morning to night" timeline
 *   - the specific Agentrix capabilities they touch
 *   - a CTA to the relevant feature page or download
 */
import Link from 'next/link';
import { motion } from 'framer-motion';
import { MarketingLayout } from '../components/marketing/MarketingLayout';
import { buildSeo } from '../lib/seo';
import { useLocalization } from '../contexts/LocalizationContext';
import {
  Heart, Briefcase, TrendingUp, GraduationCap, ShoppingBag, Users,
  ArrowRight, Smartphone, Monitor, Watch, Globe, Server,
} from 'lucide-react';

interface Scenario {
  id: string;
  icon: typeof Heart;
  accent: string;
  layer: { zh: string; en: string };
  title: { zh: string; en: string };
  subtitle: { zh: string; en: string };
  pitch: { zh: string; en: string };
  timeline: Array<{
    when: { zh: string; en: string };
    surface: 'mobile' | 'desktop' | 'web' | 'watch' | 'server';
    action: { zh: string; en: string };
  }>;
  capabilities: { zh: string; en: string }[];
  cta: { label: { zh: string; en: string }; href: string };
}

const SURFACE_ICON: Record<Scenario['timeline'][number]['surface'], typeof Smartphone> = {
  mobile: Smartphone,
  desktop: Monitor,
  web: Globe,
  watch: Watch,
  server: Server,
};

const SCENARIOS: Scenario[] = [
  {
    id: 'companion',
    icon: Heart,
    accent: 'from-rose-500 to-pink-500',
    layer: { zh: 'Living', en: 'Living' },
    title: { zh: '林夏 · 设计师', en: 'Lin Xia · Designer' },
    subtitle: {
      zh: '把 Aira 当作"日常陪伴 + 灵感伙伴"',
      en: "Treats Aira as a daily companion + inspiration buddy",
    },
    pitch: {
      zh: '林夏每天 8 小时坐在电脑前画图。她的 Agentrix 主宠 Aira 是一只赛博灵狐，记得她在做什么项目、上次卡在什么问题、最近的设计参考。下班后 Mobile 上还会跟她吐槽一天的烦心事。',
      en: 'Lin Xia draws 8 hours/day at her desk. Her Agentrix pet Aira is a cyber fox who remembers her current project, last blocker, and recent design refs. After work, on Mobile, Aira even commiserates about her day.',
    },
    timeline: [
      { when: { zh: '8:30 通勤', en: '8:30 commute' }, surface: 'watch', action: { zh: 'Watch 上一句 Sora 早安，显示昨天剩 3 个未办', en: 'Watch greets her with yesterday\'s 3 open tasks' } },
      { when: { zh: '10:00 工作', en: '10:00 working' }, surface: 'desktop', action: { zh: 'Desktop 浮球 → 单击聊设计灵感', en: 'Desktop ball → single-click to chat design ideas' } },
      { when: { zh: '14:00 卡壳', en: '14:00 stuck' }, surface: 'desktop', action: { zh: 'Pro Mode → 调用 Skill: 参考案例搜索', en: 'Pro Mode → invoke Skill: reference case search' } },
      { when: { zh: '20:00 回家', en: '20:00 home' }, surface: 'mobile', action: { zh: 'Mobile 主宠陪她吐槽今天的项目甲方', en: 'Mobile pet listens to her vent about today\'s client' } },
    ],
    capabilities: [
      { zh: '4 层记忆系统(短/工/事件/语义)', en: '4-tier memory system' },
      { zh: 'VRM 高保真主宠渲染', en: 'VRM hi-fi pet rendering' },
      { zh: '5 端联动 · 同一份记忆', en: '5-surface sync · one memory' },
    ],
    cta: { label: { zh: '了解 Living Pet', en: 'Learn Living Pet' }, href: '/manifesto' },
  },
  {
    id: 'developer',
    icon: Briefcase,
    accent: 'from-blue-500 to-cyan-500',
    layer: { zh: 'Doer', en: 'Doer' },
    title: { zh: '张铭 · 全栈工程师', en: 'Zhang Ming · Full-stack engineer' },
    subtitle: {
      zh: '用 Forge 让 6 只 Agent 并行跑 worktree',
      en: 'Uses Forge to run 6 agents on parallel worktrees',
    },
    pitch: {
      zh: '张铭做一个 SaaS 创业项目,自己一个人。他在 Desktop 上启 6 只 Agent — 每只跑一个 Git worktree(后端 / 前端 / 测试 / 文档 / 数据库迁移 / 部署)。Mobile 接收审批 push,通过后自动 merge。',
      en: 'Zhang Ming builds a SaaS solo. On Desktop, he spins up 6 agents — each on its own Git worktree (backend / frontend / tests / docs / DB migration / deploy). Mobile receives approval pushes, auto-merges on OK.',
    },
    timeline: [
      { when: { zh: '9:00', en: '9:00' }, surface: 'desktop', action: { zh: 'Desktop 启 6 worktrees + Forge 分配任务', en: 'Desktop spins up 6 worktrees + Forge dispatches' } },
      { when: { zh: '11:30', en: '11:30' }, surface: 'mobile', action: { zh: 'Mobile push: "前端 Agent 完成,要 merge 吗?"', en: 'Mobile push: "Frontend agent done — merge?"' } },
      { when: { zh: '15:00', en: '15:00' }, surface: 'web', action: { zh: 'Web Console 看任务燃尽 + 调用次数', en: 'Web Console: burndown + call count' } },
      { when: { zh: '18:00', en: '18:00' }, surface: 'desktop', action: { zh: '一次 commit 把 6 个 PR 合并 + 部署', en: 'One commit, 6 PRs merged + deployed' } },
    ],
    capabilities: [
      { zh: '多 Worktree 并行', en: 'Multi-worktree parallelism' },
      { zh: 'Skill Canvas 可视化任务图', en: 'Skill Canvas task graph' },
      { zh: 'Mobile push 审批 + 多端 co-sign', en: 'Mobile push approval + multi-surface co-sign' },
    ],
    cta: { label: { zh: '查看 Doer 工作台', en: 'See Doer workspace' }, href: '/features' },
  },
  {
    id: 'trader',
    icon: TrendingUp,
    accent: 'from-amber-500 to-orange-500',
    layer: { zh: 'Economy', en: 'Economy' },
    title: { zh: '李明 · 自由职业者', en: 'Li Ming · Freelancer' },
    subtitle: {
      zh: '让 Trader Agent 在 Server 端 24×7 接单 / 结算',
      en: 'Trader Agent accepts and settles orders 24/7 on Server',
    },
    pitch: {
      zh: '李明白天接客户单,晚上让自己的 Trader Agent 自动接 Skill 市场上的小单(数据清洗 / 文案润色 / API 调用)。X402 自动结算 USDC,周末扫一眼 Mobile 看本周收益。',
      en: 'By day, Li Ming takes client work. By night, his Trader agent picks up small Skill-market jobs (data cleaning / copywriting / API calls). X402 settles USDC automatically; he checks Mobile on weekends.',
    },
    timeline: [
      { when: { zh: '主班', en: 'Main shift' }, surface: 'desktop', action: { zh: '客户项目 + Forge 协作', en: 'Client work + Forge co-pilot' } },
      { when: { zh: '夜班', en: 'Night shift' }, surface: 'server', action: { zh: 'Trader Agent 7×24 接 Skill 单', en: 'Trader Agent accepts skill orders 24/7' } },
      { when: { zh: '入账', en: 'Settle' }, surface: 'server', action: { zh: 'X402 微支付 → MPC 钱包', en: 'X402 micropay → MPC wallet' } },
      { when: { zh: '周末', en: 'Weekend' }, surface: 'mobile', action: { zh: 'Mobile 看周收益 + 调整预算上限', en: 'Mobile checks weekly earnings + tweaks budget caps' } },
    ],
    capabilities: [
      { zh: 'A2A 协议 · Agent 间互调', en: 'A2A protocol · agent-to-agent calls' },
      { zh: 'X402 微支付 · 按次结算 USDC', en: 'X402 micropay · per-call USDC settlement' },
      { zh: 'Auto-Earn Timeline + 预算池', en: 'Auto-Earn timeline + budget pools' },
    ],
    cta: { label: { zh: '了解 Auto-Earn', en: 'Learn Auto-Earn' }, href: '/pricing' },
  },
  {
    id: 'creator',
    icon: ShoppingBag,
    accent: 'from-violet-500 to-fuchsia-500',
    layer: { zh: 'Creator', en: 'Creator' },
    title: { zh: '张默默 · 美术师', en: 'Zhang Momo · Visual artist' },
    subtitle: {
      zh: '把自创 IP 灵狐变成 Skin Marketplace 限定皮肤',
      en: 'Mints her IP fox as a Skin Marketplace limited',
    },
    pitch: {
      zh: '默默有个原创 IP "灵狐九重"。她用 PetCreator 把 IP 转成 Agentrix 主宠皮肤,上 Marketplace 拍卖。首位出价者 +5% Cinderella Boost,反狙击自动延时 — 一只皮肤拍出 50 USDC,创作者拿 70%。',
      en: 'Momo has an original IP "Nine-tailed Fox". She uses PetCreator to convert it into an Agentrix skin and auctions it. First bidder gets +5% Cinderella Boost, anti-snipe auto-extends — one skin sells for 50 USDC, creator keeps 70%.',
    },
    timeline: [
      { when: { zh: '创作', en: 'Create' }, surface: 'mobile', action: { zh: 'PetCreator 图生 → 30 秒出 .vrm', en: 'PetCreator image-to-pet → 30s .vrm output' } },
      { when: { zh: '上架', en: 'List' }, surface: 'web', action: { zh: 'Web /market/sell 5 步上架向导', en: 'Web /market/sell 5-step wizard' } },
      { when: { zh: '出价', en: 'Bid' }, surface: 'mobile', action: { zh: 'Mobile push: "你的拍卖有出价!"', en: 'Mobile push: "Your auction got a bid!"' } },
      { when: { zh: '结算', en: 'Settle' }, surface: 'mobile', action: { zh: 'USDC 入 MPC 钱包 + Twitter 分享', en: 'USDC into MPC wallet + Twitter share' } },
    ],
    capabilities: [
      { zh: 'PetCreator 4 模式生成', en: 'PetCreator 4 modes' },
      { zh: 'Cinderella Boost + 反狙击', en: 'Cinderella Boost + anti-snipe' },
      { zh: 'Remix royalty 衍生分成', en: 'Remix royalty splits' },
    ],
    cta: { label: { zh: '了解 Marketplace', en: 'Explore Marketplace' }, href: '/market' },
  },
  {
    id: 'student',
    icon: GraduationCap,
    accent: 'from-emerald-500 to-teal-500',
    layer: { zh: 'Education', en: 'Education' },
    title: { zh: '王同学 · 大三', en: 'Wang · Junior student' },
    subtitle: {
      zh: '用 AI 主宠学习 + 编程 + 作业辅助',
      en: 'AI pet for studying + coding + homework',
    },
    pitch: {
      zh: '王同学拿到学校的免费 Pro 订阅(教育合作)。他的主宠"小白"是一个学习陪伴 IP,会陪他刷算法题、写论文、辅助编程作业。期末用 AXP 兑换了限定毕业纪念皮肤。',
      en: 'Wang got the school\'s free Pro subscription (education partnership). His pet "Xiaobai" is a learning companion IP that drills algorithms, helps with papers, and assists coding HW. He redeemed AXP for a graduation-themed limited skin at semester end.',
    },
    timeline: [
      { when: { zh: '早读', en: 'Morning' }, surface: 'mobile', action: { zh: 'Mobile 学习卡片 + 单词复习', en: 'Mobile learning cards + word review' } },
      { when: { zh: '下午课', en: 'Afternoon class' }, surface: 'desktop', action: { zh: 'Desktop 听课同时记笔记 + 自动总结', en: 'Desktop notes + auto-summary during class' } },
      { when: { zh: '晚自习', en: 'Evening' }, surface: 'desktop', action: { zh: 'Pro Mode 算法题 / 论文协作', en: 'Pro Mode algorithm Q&A / paper writing' } },
      { when: { zh: '周末', en: 'Weekend' }, surface: 'web', action: { zh: 'Web /market 兑限定皮肤 + 同学交易', en: 'Web /market — redeem limited skins + student trades' } },
    ],
    capabilities: [
      { zh: '免费 Pro 订阅(教育合作)', en: 'Free Pro tier (edu partner)' },
      { zh: 'AXP 兑换商店 8 类奖励', en: 'AXP redeem shop · 8 reward types' },
      { zh: '本地 LLM 离线辅助 / 隐私保护', en: 'Local LLM offline / privacy-safe' },
    ],
    cta: { label: { zh: '教育合作', en: 'Education partnership' }, href: '/partners#education' },
  },
  {
    id: 'family',
    icon: Users,
    accent: 'from-purple-500 to-indigo-500',
    layer: { zh: 'Family', en: 'Family' },
    title: { zh: '陈家 · 三口', en: 'Chen family · 3 members' },
    subtitle: {
      zh: '一只家庭主宠,所有成员共养',
      en: 'One family pet, raised by all members',
    },
    pitch: {
      zh: '陈家有一只共养主宠"福福"。爸爸用它管家庭日历,妈妈用它做菜谱,9 岁孩子用它学英语。Co-Raising 协议给孩子限定权限(不能调用钱包 / 不能买东西)。每天三人的喂食加分都进同一个 XP 池。',
      en: 'The Chen family co-raises a pet "Fufu". Dad uses it for the calendar, mom for recipes, the 9-year-old for English. Co-Raising protocol restricts the kid (no wallet calls, no purchases). All three\'s daily feeds add up to the shared XP pool.',
    },
    timeline: [
      { when: { zh: '早晨', en: 'Morning' }, surface: 'mobile', action: { zh: '爸爸看日历 + 妈妈定早餐', en: 'Dad: calendar · Mom: breakfast plan' } },
      { when: { zh: '放学', en: 'After school' }, surface: 'mobile', action: { zh: '孩子练英语对话(限制权限)', en: 'Kid practices English (restricted role)' } },
      { when: { zh: '晚饭', en: 'Dinner' }, surface: 'desktop', action: { zh: '三人共养 → 福福 +30 XP', en: 'All three feed → Fufu +30 XP' } },
      { when: { zh: '睡前', en: 'Bedtime' }, surface: 'watch', action: { zh: 'Watch 收福福一句晚安', en: 'Watch receives Fufu\'s goodnight ping' } },
    ],
    capabilities: [
      { zh: '家庭账号 RBAC(owner/admin/member/child)', en: 'Family RBAC (owner/admin/member/child)' },
      { zh: 'Co-Raising 共养协议', en: 'Co-Raising protocol' },
      { zh: '隐私围栏 4 类敏感分区', en: 'Privacy fence · 4 sensitive zones' },
    ],
    cta: { label: { zh: '了解 Family', en: 'Learn Family' }, href: '/family' },
  },
];

export default function UseCasesPage() {
  const { t } = useLocalization();
  const seo = buildSeo({
    title: t({ zh: '应用场景 · Agentrix', en: 'Use cases · Agentrix' }),
    description: t({
      zh: '6 个真实场景:设计师 / 工程师 / 自由职业者 / 创作者 / 学生 / 家庭。看 Agentrix 在每个角色身边怎么工作。',
      en: '6 real-world scenarios: designer / engineer / freelancer / creator / student / family. See how Agentrix works for each.',
    }),
    path: '/use-cases',
  });

  return (
    <MarketingLayout seo={seo}>
      <section className="border-b border-agentrix-inkLine bg-agentrix-ink py-20">
        <div className="container mx-auto max-w-4xl px-6 text-center">
          <h1 className="text-4xl font-extrabold md:text-5xl">{t({ zh: '6 个真实场景', en: '6 real scenarios' })}</h1>
          <p className="mt-4 text-agentrix-fog">
            {t({
              zh: '从设计师到全家三口，看 Agentrix 在每个角色身边的具体打法。',
              en: 'From a designer to a family of three, see how Agentrix actually plays out in each role.',
            })}
          </p>
        </div>
      </section>

      <section className="bg-agentrix-ink py-16">
        <div className="container mx-auto max-w-5xl px-6 space-y-12">
          {SCENARIOS.map((s, i) => {
            const Icon = s.icon;
            return (
              <motion.article
                key={s.id}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-50px' }}
                transition={{ duration: 0.4, delay: Math.min(i * 0.04, 0.2) }}
                className="rounded-2xl border border-agentrix-inkLine bg-agentrix-inkSoft p-6 md:p-8"
                id={s.id}
              >
                <header className="grid gap-4 md:grid-cols-[auto_1fr_auto] md:items-center">
                  <div className={`inline-flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br ${s.accent} text-white`}>
                    <Icon size={26} />
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-widest text-agentrix-mist">{t(s.layer)}</p>
                    <h2 className="mt-1 text-xl font-bold text-white md:text-2xl">{t(s.title)}</h2>
                    <p className="mt-1 text-sm text-agentrix-fog">{t(s.subtitle)}</p>
                  </div>
                  <Link
                    href={s.cta.href}
                    className="inline-flex items-center gap-2 self-start rounded-full bg-white/10 px-5 py-2 text-xs font-bold text-white hover:bg-white/15 md:self-center"
                  >
                    {t(s.cta.label)} <ArrowRight size={12} />
                  </Link>
                </header>

                <p className="mt-5 text-sm text-agentrix-fog leading-relaxed md:text-base">{t(s.pitch)}</p>

                <div className="mt-6 grid gap-6 md:grid-cols-[1.6fr_1fr]">
                  {/* Timeline */}
                  <div>
                    <p className="mb-3 text-xs font-bold uppercase tracking-wider text-agentrix-electric">
                      {t({ zh: '一日时间线', en: 'A day in the life' })}
                    </p>
                    <ol className="space-y-2">
                      {s.timeline.map((step, idx) => {
                        const SurfaceIcon = SURFACE_ICON[step.surface];
                        return (
                          <li key={idx} className="flex items-start gap-3 text-sm">
                            <span className="flex-shrink-0 inline-flex h-7 min-w-[64px] items-center justify-center rounded-md bg-white/[0.04] px-2 text-[10px] font-bold uppercase tracking-wider text-agentrix-mist">
                              {t(step.when)}
                            </span>
                            <SurfaceIcon size={14} className="mt-1.5 flex-shrink-0 text-agentrix-electric" />
                            <span className="text-agentrix-fog">{t(step.action)}</span>
                          </li>
                        );
                      })}
                    </ol>
                  </div>
                  {/* Capabilities */}
                  <div>
                    <p className="mb-3 text-xs font-bold uppercase tracking-wider text-agentrix-solar">
                      {t({ zh: '关键能力', en: 'Key capabilities' })}
                    </p>
                    <ul className="space-y-2 text-sm">
                      {s.capabilities.map((c, idx) => (
                        <li key={idx} className="flex items-start gap-2">
                          <span className="mt-1.5 inline-block h-1.5 w-1.5 rounded-full bg-agentrix-solar" />
                          <span className="text-agentrix-fog">{t(c)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </motion.article>
            );
          })}
        </div>
      </section>

      <section className="border-t border-agentrix-inkLine bg-agentrix-inkSoft py-16">
        <div className="container mx-auto max-w-3xl px-6 text-center">
          <h2 className="text-2xl font-bold md:text-3xl">
            {t({ zh: '你的场景没在上面?', en: "Your scenario not above?" })}
          </h2>
          <p className="mt-3 text-agentrix-fog">
            {t({
              zh: '我们持续收集真实使用案例。把你的故事告诉我们 — 它可能成为下一个用例。',
              en: 'We collect real usage stories. Tell us yours — it might become the next showcase.',
            })}
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link
              href="/contact"
              className="inline-flex items-center gap-2 rounded-full bg-agentrix-electric px-6 py-3 text-sm font-bold text-agentrix-ink hover:opacity-90"
            >
              {t({ zh: '分享你的用例', en: 'Share your story' })} <ArrowRight size={14} />
            </Link>
            <Link
              href="/download"
              className="inline-flex items-center gap-2 rounded-full border border-agentrix-inkLine bg-white/5 px-6 py-3 text-sm font-semibold text-white hover:bg-white/10"
            >
              {t({ zh: '先试试看', en: 'Try it first' })}
            </Link>
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}
