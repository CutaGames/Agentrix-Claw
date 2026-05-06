import Head from 'next/head';
import Link from 'next/link';

/**
 * Phase 6 M1 — 6-clan landing page.
 *
 * PRD: docs/PRD_PET_6_CLANS_PERSONA.zh-CN.md §3-§8
 *      docs/PRD_PET_PHASED_DEV_PLAN.zh-CN.md §9.2 M1
 *
 * Public marketing page that introduces all 6 clans + 28 signature pets. Each
 * pet card maps 1:1 to a row in `pet_soul_templates` (slug = card href).
 * Cards are wired to /p/<slug> for the public-profile route stub.
 */

type Pet = {
  id: string;          // matches pet_soul_templates.id
  name: string;
  nameEn: string;
  hook: string;
};

type Clan = {
  key: 'A_office' | 'B_life' | 'C_learn' | 'D_play' | 'E_web3' | 'F_family';
  title: string;
  subtitle: string;
  tier: string;
  accent: string; // tailwind bg
  pets: Pet[];
};

const CLANS: Clan[] = [
  {
    key: 'A_office',
    title: 'A · 办公军团',
    subtitle: '高 ARPU · 高生产力 · 7 只',
    tier: 'high_arpu',
    accent: 'bg-slate-100 border-slate-300',
    pets: [
      { id: 'claw',   name: '爪爪', nameEn: 'Claw',   hook: '替你跑会议、写邮件、谈合作' },
      { id: 'tinker', name: '叮当', nameEn: 'Tinker', hook: '读源码、debug、写架构' },
      { id: 'sentry', name: '哨兵', nameEn: 'Sentry', hook: '看护你的钱包和密钥' },
      { id: 'hawk',   name: '猎鹰', nameEn: 'Hawk',   hook: '替你写邮件、跟单、谈价格' },
      { id: 'owl',    name: '夜枭', nameEn: 'Owl',    hook: '24 小时替你读论文' },
      { id: 'fox',    name: '狐火', nameEn: 'Fox',    hook: '想 100 个 slogan' },
      { id: 'dragon', name: '龙脉', nameEn: 'Dragon', hook: '站在 5 年后看现在' },
    ],
  },
  {
    key: 'B_life',
    title: 'B · 生活伙伴',
    subtitle: '高 DAU · 大众市场 · 5 只',
    tier: 'high_dau',
    accent: 'bg-emerald-50 border-emerald-300',
    pets: [
      { id: 'sprout', name: '小芽', nameEn: 'Sprout', hook: '陪你养成健康习惯' },
      { id: 'mochi',  name: '麻薯', nameEn: 'Mochi',  hook: '今天吃什么我来想' },
      { id: 'bunbun', name: '兔兔', nameEn: 'Bunbun', hook: '只听不评判的耳朵' },
      { id: 'coco',   name: '可可', nameEn: 'Coco',   hook: '替你搭配每天造型' },
      { id: 'nova',   name: '星辰', nameEn: 'Nova',   hook: '管理通勤、日程、周末' },
    ],
  },
  {
    key: 'C_learn',
    title: 'C · 学习成长',
    subtitle: '教育市场 · 4 只',
    tier: 'edu',
    accent: 'bg-sky-50 border-sky-300',
    pets: [
      { id: 'pino',    name: '皮诺', nameEn: 'Pino',  hook: 'K-12 一起搞定的好朋友' },
      { id: 'lumi',    name: '流光', nameEn: 'Lumi',  hook: '论文 / 备考 / 申请，一起扛' },
      { id: 'sage',    name: '贤者', nameEn: 'Sage',  hook: '替你管理一辈子的知识库' },
      { id: 'pixel_c', name: '像素', nameEn: 'Pixel', hook: '从 Hello World 到上线' },
    ],
  },
  {
    key: 'D_play',
    title: 'D · 娱乐玩伴',
    subtitle: '病毒 · 社交裂变 · 4 只',
    tier: 'viral',
    accent: 'bg-pink-50 border-pink-300',
    pets: [
      { id: 'goblin',  name: '哥布林', nameEn: 'Goblin',  hook: '想 meme、想整蛊' },
      { id: 'vibe',    name: '律动',   nameEn: 'Vibe',    hook: '按心情挑音乐' },
      { id: 'pixel_g', name: '像素客', nameEn: 'Pixel-G', hook: '陪你打、陪你速通' },
      { id: 'otaku',   name: '御宅',   nameEn: 'Otaku',   hook: '追番、找同人、查 lore' },
    ],
  },
  {
    key: 'E_web3',
    title: 'E · Web3 投资',
    subtitle: '最高 ARPU · 4 只',
    tier: 'web3',
    accent: 'bg-amber-50 border-amber-300',
    pets: [
      { id: 'whale',   name: '鲸落', nameEn: 'Whale',   hook: '看大额头寸 / 风险' },
      { id: 'diamond', name: '钻爪', nameEn: 'Diamond', hook: '坚持 DCA、复利' },
      { id: 'bull',    name: '金牛', nameEn: 'Bull',    hook: '扫短线机会' },
      { id: 'doge_x',  name: '旺财', nameEn: 'Doge-X',  hook: 'Meme / NFT 雷达' },
    ],
  },
  {
    key: 'F_family',
    title: 'F · 家庭陪伴',
    subtitle: '家庭 / 银发 / 联名玩具 · 3 只',
    tier: 'family',
    accent: 'bg-rose-50 border-rose-300',
    pets: [
      { id: 'teddy',  name: '泰迪', nameEn: 'Teddy',  hook: '陪孩子的温柔朋友' },
      { id: 'granny', name: '暖暖', nameEn: 'Granny', hook: '银发陪伴 + 防诈骗' },
      { id: 'furry',  name: '毛球', nameEn: 'Furry',  hook: '住进毛绒玩具的灵魂' },
    ],
  },
];

export default function ClansLandingPage() {
  const total = CLANS.reduce((acc, c) => acc + c.pets.length, 0);
  return (
    <>
      <Head>
        <title>6 族群 · 28 只签名宠物 · Agentrix</title>
        <meta
          name="description"
          content="Agentrix 6 族群 · 28 只签名宠物。从办公军团到家庭陪伴，每只都有自己的灵魂模板与专长。"
        />
        <meta property="og:title" content="Agentrix 6 族群 · 28 只签名宠物" />
        <meta property="og:type" content="website" />
      </Head>
      <main className="mx-auto max-w-6xl p-8 text-gray-900">
        <header className="mb-10">
          <h1 className="text-4xl font-bold mb-2">6 族群 · {total} 只签名宠物</h1>
          <p className="text-gray-600">
            每只 Agentrix 宠物都有独立的灵魂模板（人格 / 口吻 / 专长 / 工具白名单）。挑一只开始，或者把灵魂搬到你已有的皮肤上。
          </p>
        </header>

        <nav className="flex flex-wrap gap-2 mb-8" data-testid="clans-nav">
          {CLANS.map((c) => (
            <a
              key={c.key}
              href={`#${c.key}`}
              className={`px-3 py-1 rounded border text-sm ${c.accent}`}
              data-testid="clans-nav-item"
            >
              {c.title}
            </a>
          ))}
        </nav>

        {CLANS.map((clan) => (
          <section
            key={clan.key}
            id={clan.key}
            className={`mb-10 rounded-lg border p-6 ${clan.accent}`}
            data-testid="clan-section"
          >
            <header className="mb-4">
              <h2 className="text-2xl font-semibold" data-testid="clan-title">{clan.title}</h2>
              <p className="text-sm text-gray-600">{clan.subtitle} · tier <code>{clan.tier}</code></p>
            </header>
            <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3" data-testid="clan-pets">
              {clan.pets.map((p) => (
                <li key={p.id} className="bg-white rounded border p-3" data-testid="clan-pet-card">
                  <Link href={`/p/${p.id}`} className="block">
                    <div className="flex items-baseline justify-between">
                      <span className="font-semibold">{p.name}</span>
                      <span className="text-xs text-gray-500">{p.nameEn}</span>
                    </div>
                    <p className="text-sm text-gray-700 mt-1">{p.hook}</p>
                    <p className="text-xs text-blue-600 mt-2">/p/{p.id} →</p>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}

        <footer className="text-sm text-gray-500 border-t pt-4">
          <p>
            想嵌入你自己的网站？看{' '}
            <Link href="/developers/embed" className="text-blue-600 underline">嵌入指南</Link>
            ；想做联名硬件？看{' '}
            <Link href="/hardware" className="text-blue-600 underline">合作伙伴硬件</Link>。
          </p>
        </footer>
      </main>
    </>
  );
}
