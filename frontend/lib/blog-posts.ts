/**
 * Blog post registry — Sprint W-4 Day 3.
 *
 * Until we land a CMS / Notion integration, posts live as TypeScript
 * data here for type-safety and SEO. Add a new entry + a markdown
 * file under `frontend/lib/blog-content/` to publish.
 */

export interface BlogPost {
  slug: string;
  title: { zh: string; en: string };
  description: { zh: string; en: string };
  date: string;
  author: { name: string; role: { zh: string; en: string } };
  tags: string[];
  /** Lazy import — loaded server-side at build time */
  contentFile: string;
  /** Hero icon emoji (kept simple; no image hosting yet) */
  emoji: string;
}

export const BLOG_POSTS: BlogPost[] = [
  {
    slug: 'agentrix-v4-launch',
    title: {
      zh: 'Agentrix v4 正式发布：Pet-as-Agent Economy 的第一次完整亮相',
      en: 'Agentrix v4 launch — the first complete reveal of Pet-as-Agent Economy',
    },
    description: {
      zh: 'V4 上线 8 大能力，含 4 项 V4 New：灵魂 × 皮肤、PetCreator 4 模式、Skin Marketplace、Toy + NFC 实物联动。',
      en: 'V4 ships 8 capabilities, with 4 V4-new: Soul × Skin, PetCreator 4 modes, Skin Marketplace, Toy + NFC physical tie-in.',
    },
    date: '2026-05-16',
    author: { name: 'Agentrix Team', role: { zh: '团队', en: 'Team' } },
    tags: ['Release', 'V4', 'Pet-as-Agent'],
    contentFile: 'agentrix-v4-launch.md',
    emoji: '🎉',
  },
  {
    slug: 'pet-as-agent-thesis',
    title: {
      zh: 'Pet-as-Agent：为什么要把"养宠物"和"AI Agent"耦合',
      en: 'Pet-as-Agent: why we couple raising pets with AI agents',
    },
    description: {
      zh: '从设计哲学谈起：持久性 / 拥有感 / 赚钱能力，是 Agent 必须 而 ChatGPT 缺失 的三件事。',
      en: 'Design philosophy: persistence, ownership and earning power — three things agents need that chatbots lack.',
    },
    date: '2026-05-12',
    author: { name: '木目', role: { zh: '产品 Lead', en: 'Product Lead' } },
    tags: ['Thesis', 'Design', 'Agent OS'],
    contentFile: 'pet-as-agent-thesis.md',
    emoji: '🐾',
  },
  {
    slug: 'beta-100-progress',
    title: {
      zh: '从 0 到 100：Agentrix 内测的 30 天观察',
      en: 'From 0 to 100: 30 days of Agentrix beta in numbers',
    },
    description: {
      zh: '内测 30 天，500+ 主宠生成、35 个生产端点全绿、5 端联动跑通。我们学到了什么，下一步又要做什么。',
      en: '30 days, 500+ pets generated, 35/35 prod smoke green, 5 surfaces connected. What we learned and what comes next.',
    },
    date: '2026-05-10',
    author: { name: '汐瑶', role: { zh: '增长', en: 'Growth' } },
    tags: ['Behind-the-scenes', 'Metrics'],
    contentFile: 'beta-100-progress.md',
    emoji: '📊',
  },
];

export function getPostBySlug(slug: string): BlogPost | null {
  return BLOG_POSTS.find((p) => p.slug === slug) ?? null;
}
