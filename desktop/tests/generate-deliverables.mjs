/**
 * Generate actual deliverables:
 * 1. Pitch Deck PPT (.pptx)
 * 2. Marketing Poster (PNG)
 * 3. Submit 3D pet generation (3 form variants)
 */
import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import PptxGenJS from 'pptxgenjs';

const token = readFileSync('tests/.e2e-token.txt', 'utf8').trim();
const OUTPUT_DIR = join(process.cwd(), '..', 'deliverables');
mkdirSync(OUTPUT_DIR, { recursive: true });

const API = 'https://api.agentrix.top/api';
const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };

console.log('=== Agentrix Deliverables Generator ===\n');

// ─── 1. Generate PPT (Node.js, no browser needed) ────────────────
console.log('📊 1. Generating Pitch Deck PPT...');

const pptx = new PptxGenJS();
pptx.author = 'Agentrix';
pptx.title = 'Agentrix Pitch Deck 2026';
pptx.defineLayout({ name: 'WIDE', width: 13.33, height: 7.5 });
pptx.layout = 'WIDE';

const slideData = [
  { title: 'Agentrix', subtitle: 'AI 宠物操作系统 — 横穿 6 端的灵魂伙伴', layout: 'title' },
  { title: '问题', bullets: ['AI 助手同质化严重，用户无情感黏性', '5+ 设备间切换，AI 记忆断裂', '创作者经济被平台垄断，AI 生成内容无法变现'], layout: 'content' },
  { title: '解决方案', bullets: ['一只有灵魂的 AI 宠物，住在你的所有设备里', '灵魂 × 皮肤双层架构：情感绑定 + 经济流通', 'PetCreator 用户共创：一句话生成 3D 宠物，30 秒出图'], layout: 'content' },
  { title: '产品矩阵', bullets: ['🖥️ 桌面端：编程助手 + 桌面伙伴', '📱 手机端：语音对话 + 钱包签名', '🌐 Web 端：创作工坊 + 皮肤市场', '⌚ 手表端：心率感知 + 快速审批', '🕶️ 眼镜端：视觉增强 + AR 互动', '🧸 玩具端：物理化身 + 触觉反馈'], layout: 'content' },
  { title: '核心差异化', bullets: ['多形态变身：萌态 / 专家态 / 商人态 自动切换', '跨端同步：一只灵魂横穿 6 个屏幕', 'Agent 经济：宠物替你接单赚钱', 'UGC 市场：皮肤上架 / 拍卖 / Remix 分成'], layout: 'content' },
  { title: '商业模式', bullets: ['订阅收入 55%：5 档 SaaS ($5-$69/月)', 'Marketplace GMV 抽成 25%：皮肤/技能交易 30%', '硬件生态认证费 10%：L2 联名 + L3 年费', '企业定制 10%'], layout: 'content' },
  { title: '单位经济', bullets: ['综合毛利/MAU: +$1.29/月', 'Break-even: 775 MAU', '10k MAU → +$155k 年化', '100k MAU → +$1.5M 年化', '1M MAU → +$15M 年化'], layout: 'content' },
  { title: '市场规模', bullets: ['TAM: $180B (AI 助手 + 虚拟宠物 + 创作者经济)', 'SAM: $12B (AI 伴侣 + UGC 3D 资产)', 'SOM: $120M (首年 10 万付费用户 × $100 ARPU)'], layout: 'content' },
  { title: '牵引力', bullets: ['✅ 全平台产品上线（桌面/移动/Web/后端）', '✅ 80+ 后端模块，200+ API 端点', '✅ PetCreator 文生/图生已上线（Meshy + 腾讯混元3D）', '✅ 6 族群 28 签名宠物人格系统', '✅ AXP 积分 + 5 档订阅 + Marketplace', '✅ 桌面端 Computer Use（鼠标/键盘/屏幕控制）'], layout: 'content' },
  { title: '融资需求', bullets: ['种子轮 / Pre-A: $500k - $1M', '估值: $5M - $8M (Pre-money)', '研发 50% · 市场 25% · 硬件生态 15% · 运营 10%'], layout: 'content' },
  { title: '愿景', subtitle: '让每个人都拥有一只有灵魂的 AI 宠物\n它住在你的所有设备里\n替你工作 · 陪你成长 · 帮你赚钱\n\nAgentrix — AI Pet Operating System', layout: 'title' },
];

for (const s of slideData) {
  const slide = pptx.addSlide();
  slide.background = { color: '0B1220' };
  if (s.layout === 'title') {
    slide.addText(s.title, { x: 1, y: 2.2, w: 11.33, h: 1.5, fontSize: 44, bold: true, color: 'FFFFFF', align: 'center', valign: 'middle', fontFace: 'Inter' });
    if (s.subtitle) slide.addText(s.subtitle, { x: 2, y: 4, w: 9.33, h: 2, fontSize: 22, color: '9CA3AF', align: 'center', valign: 'top', fontFace: 'Inter' });
    slide.addShape('rect', { x: 5.5, y: 3.8, w: 2.33, h: 0.05, fill: { color: '6C5CE7' } });
  } else {
    slide.addText(s.title, { x: 0.8, y: 0.4, w: 11.73, h: 0.8, fontSize: 28, bold: true, color: 'FFFFFF', align: 'left', fontFace: 'Inter' });
    slide.addShape('rect', { x: 0.8, y: 1.25, w: 3, h: 0.04, fill: { color: '6C5CE7' } });
    if (s.bullets) {
      const bulletText = s.bullets.map(b => ({ text: b, options: { fontSize: 18, color: 'D1D5DB', bullet: { type: 'bullet' }, paraSpaceAfter: 10, fontFace: 'Inter' } }));
      slide.addText(bulletText, { x: 0.8, y: 1.6, w: 11.73, h: 5.2, valign: 'top' });
    }
  }
}

const pptBuffer = await pptx.write({ outputType: 'nodebuffer' });
const pptPath = join(OUTPUT_DIR, 'Agentrix_Pitch_Deck_2026_v2.pptx');
writeFileSync(pptPath, pptBuffer);
console.log(`  ✅ PPT saved: ${pptPath} (${(pptBuffer.length / 1024).toFixed(0)} KB)\n`);

// ─── 2. Generate Poster (using browser canvas) ───────────────────
console.log('🎨 2. Generating Marketing Poster...');

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage();
await page.goto('about:blank');

const posterDataUrl = await page.evaluate(async () => {
  const width = 1080, height = 1920;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  // Background gradient
  const grad = ctx.createLinearGradient(0, 0, 0, height);
  grad.addColorStop(0, '#0B1220');
  grad.addColorStop(1, '#1a1a3e');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  // Title
  ctx.font = 'bold 72px Inter, sans-serif';
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'center';
  ctx.fillText('Agentrix', width/2, 280);

  // Subtitle
  ctx.font = '36px Inter, sans-serif';
  ctx.fillStyle = '#22D3EE';
  ctx.fillText('你的 AI 灵魂宠物', width/2, 360);

  // Tagline
  ctx.font = '24px Inter, sans-serif';
  ctx.fillStyle = '#9CA3AF';
  ctx.fillText('一只灵魂 · 六个世界 · 替你工作 · 帮你赚钱', width/2, 430);

  // Features
  const features = [
    '🖥️ 桌面端 — 编程助手 + 桌面伙伴',
    '📱 手机端 — 语音对话 + 钱包签名',
    '🌐 Web 端 — 创作工坊 + 皮肤市场',
    '⌚ 手表端 — 心率感知 + 快速审批',
    '🕶️ 眼镜端 — 视觉增强 + AR 互动',
    '🧸 玩具端 — 物理化身 + 触觉反馈',
  ];
  ctx.font = '28px Inter, sans-serif';
  ctx.fillStyle = '#E5E7EB';
  ctx.textAlign = 'left';
  features.forEach((f, i) => {
    ctx.fillText(f, 120, 600 + i * 70);
  });

  // Highlights
  ctx.font = 'bold 32px Inter, sans-serif';
  ctx.fillStyle = '#A78BFA';
  ctx.textAlign = 'center';
  ctx.fillText('✨ 一句话生成 3D 萌宠', width/2, 1150);
  ctx.fillText('💰 皮肤市场 · 创作变现', width/2, 1220);
  ctx.fillText('🔄 三形态自动切换', width/2, 1290);

  // CTA
  ctx.fillStyle = '#6C5CE7';
  ctx.beginPath();
  ctx.roundRect(width/2 - 200, 1450, 400, 80, 40);
  ctx.fill();
  ctx.font = 'bold 32px Inter, sans-serif';
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'center';
  ctx.fillText('立即下载', width/2, 1500);

  // Footer
  ctx.font = '20px Inter, sans-serif';
  ctx.fillStyle = '#6B7280';
  ctx.fillText('agentrix.top', width/2, 1650);
  ctx.fillText('© 2026 Agentrix · AI Pet Operating System', width/2, 1690);

  return canvas.toDataURL('image/png');
});

if (posterDataUrl) {
  const posterBuffer = Buffer.from(posterDataUrl.split(',')[1], 'base64');
  const posterPath = join(OUTPUT_DIR, 'Agentrix_Poster_2026.png');
  writeFileSync(posterPath, posterBuffer);
  console.log(`  ✅ Poster saved: ${posterPath} (${(posterBuffer.length / 1024).toFixed(0)} KB)`);
} else {
  console.log('  ❌ Poster generation failed');
}

await browser.close();

// ─── 3. Generate 3D Pet (3 form variants) ────────────────────────
console.log('\n🐾 3. Submitting 3D Pet Generation (3 form variants)...');

const basePrompt = 'A cute digital fox spirit mascot for Agentrix AI platform. Indigo blue body with glowing cyan accents, large expressive eyes, pointed ears with light tips, semi-transparent flowing tail like aurora. Chibi proportions, friendly and magical appearance.';

const variants = [
  { mode: 'living', modifier: 'Curled up sleeping pose, round and soft, eyes half-closed, tail wrapped around body, gentle glow, kawaii style, peaceful' },
  { mode: 'pro', modifier: 'Standing tall and alert, sleek proportions, holographic data streams floating around, focused sharp eyes, glowing symbols orbiting, professional confident pose' },
  { mode: 'economy', modifier: 'Slightly plump and satisfied, wearing a tiny golden top hat, holding a glowing gem in one paw, smug happy expression, golden sparkles, merchant style' },
];

const taskIds = [];
for (const v of variants) {
  const prompt = `${basePrompt} Form variant (${v.mode}): ${v.modifier}`;
  try {
    const res = await fetch(`${API}/pet-generation/submit`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        mode: 'text',
        prompt,
        provider: 'hunyuan3d',
        style: 'chibi',
        enableAnimation: true,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      const tid = data.taskId || data.task?.taskId;
      if (tid) {
        taskIds.push({ mode: v.mode, taskId: tid });
        console.log(`  ✅ ${v.mode} variant submitted: ${tid}`);
      }
    } else {
      const text = await res.text();
      console.log(`  ❌ ${v.mode} failed: ${res.status} ${text.substring(0, 100)}`);
    }
  } catch (err) {
    console.log(`  ❌ ${v.mode} error: ${err.message}`);
  }
}

// Save task IDs for later polling
const tasksPath = join(OUTPUT_DIR, 'pet_generation_tasks.json');
writeFileSync(tasksPath, JSON.stringify({ basePrompt, variants: taskIds, submittedAt: new Date().toISOString() }, null, 2));
console.log(`  📝 Task IDs saved: ${tasksPath}`);
console.log(`  ⏳ 3D generation takes ~60-90s per variant. Poll with: GET ${API}/pet-generation/tasks/{taskId}`);

// ─── 4. Summary ──────────────────────────────────────────────────
console.log('\n═══════════════════════════════════════════');
console.log('📦 DELIVERABLES OUTPUT:');
console.log(`   ${OUTPUT_DIR}/`);
console.log('   ├── Agentrix_Pitch_Deck_2026.pptx');
console.log('   ├── Agentrix_Poster_2026.png');
console.log('   └── pet_generation_tasks.json (3D萌宠生成中)');
console.log('');
console.log('⏳ 3D 萌宠生成需要 60-90 秒，完成后可：');
console.log('   - 在桌面端 PetCreator 中查看');
console.log('   - 点击"设为我的萌宠"装备');
console.log('   - 点击"生成形态变体"生成三形态');
console.log('   - 在衣柜中点击"上架"到市场');
console.log('═══════════════════════════════════════════');
