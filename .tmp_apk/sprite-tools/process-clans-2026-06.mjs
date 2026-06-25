/**
 * process-clans-2026-06.mjs — 2026-06-01 宠物族群美术处理(新一批豆包交付)。
 *
 * 输入:deliverables/图片/{灵狐,猫头鹰,鲸,毛绒熊}/<action>.png
 *        全为不透明 Format24bppRgb,strip 宽高不规整(4096×1024 / 5016×836 / 2896×1448 / 2048²)。
 * 处理(逐帧):
 *   1) corner-seed flood-fill 去背(豆包底为近纯白)→ 透明
 *   2) resize 到 N×256(N=该动作帧数),严格对齐 256 网格,避免动画错位
 *   3) 文件名规范化小写(Jump→jump、pro-typeing→pro-typing)
 * 输出:
 *   灵狐 → assets/pets/sprites/default/ + desktop/public/pets/sprites/default/
 *   猫头鹰 → .../C/ ,鲸 → .../E/ ,毛绒熊 → .../F/
 *
 * 帧数表来自 PetSpriteImage 的 SPRITE_SPECS(跨端一致)。
 */
import { PNG } from 'pngjs';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const SRC = path.join(ROOT, 'deliverables', '\u56fe\u7247');

// 动作帧数(对齐 SPRITE_SPECS)
const FRAMES = {
  walk: 6, idle: 4, sleep: 2, sit: 1, jump: 4, eat: 4,
  listen: 4, talk: 6, 'pro-thinking': 4, 'pro-typing': 4, 'pro-done': 4,
  alert: 2, 'cu-mouse': 4,
};

// 源文件名(可能大小写/拼写不一)→ 规范 action
function normalizeAction(filename) {
  const base = filename.replace(/\.png$/i, '').toLowerCase();
  if (base === 'pro-typeing') return 'pro-typing';
  if (base === 'jump') return 'jump';
  return base;
}

// 族群源目录(中文)→ 输出目录代码
const CLANS = [
  { src: '\u7075\u72d0', out: 'default' }, // 灵狐 = A = default
  { src: '\u732b\u5934\u9e70', out: 'C' },  // 猫头鹰
  { src: '\u9cb8', out: 'E' },              // 鲸
  { src: '\u6bdb\u7ed2\u718a', out: 'F' },  // 毛绒熊
];

const FILL_THRESHOLD = 244; // 近纯白传播(豆包宠物底纯白;内部浅色毛发≤240 不会被吃)

function decode(buf) { const p = PNG.sync.read(buf); return { data: p.data, width: p.width, height: p.height }; }
function encode(rgba, w, h) { const png = new PNG({ width: w, height: h, colorType: 6 }); png.data = Buffer.from(rgba); return PNG.sync.write(png); }

function resizeBilinear(data, sw, sh, dw, dh) {
  const out = Buffer.alloc(dw * dh * 4);
  for (let dy = 0; dy < dh; dy++) {
    const sy = dy * (sh - 1) / (dh - 1);
    const y0 = Math.floor(sy), y1 = Math.min(y0 + 1, sh - 1), fy = sy - y0;
    for (let dx = 0; dx < dw; dx++) {
      const sx = dx * (sw - 1) / (dw - 1);
      const x0 = Math.floor(sx), x1 = Math.min(x0 + 1, sw - 1), fx = sx - x0;
      const di = (dy * dw + dx) * 4;
      for (let c = 0; c < 4; c++) {
        const v00 = data[(y0 * sw + x0) * 4 + c], v10 = data[(y0 * sw + x1) * 4 + c];
        const v01 = data[(y1 * sw + x0) * 4 + c], v11 = data[(y1 * sw + x1) * 4 + c];
        const top = v00 + (v10 - v00) * fx, bot = v01 + (v11 - v01) * fx;
        out[di + c] = Math.round(top + (bot - top) * fy);
      }
    }
  }
  return out;
}

function isWhitish(data, idx) {
  return Math.min(data[idx], data[idx + 1], data[idx + 2]) >= FILL_THRESHOLD;
}

function floodFillBackground(data, w, h) {
  const out = Buffer.from(data);
  const total = w * h;
  const visited = new Uint8Array(total);
  const stack = [];
  for (const [sx, sy] of [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]]) {
    const idx = sy * w + sx;
    if (isWhitish(data, idx * 4)) stack.push(idx);
  }
  let bg = 0;
  while (stack.length) {
    const idx = stack.pop();
    if (visited[idx]) continue;
    if (!isWhitish(data, idx * 4)) continue;
    visited[idx] = 1; out[idx * 4 + 3] = 0; bg++;
    const x = idx % w, y = (idx / w) | 0;
    if (x > 0) stack.push(idx - 1);
    if (x < w - 1) stack.push(idx + 1);
    if (y > 0) stack.push(idx - w);
    if (y < h - 1) stack.push(idx + w);
  }
  for (let i = 0; i < total; i++) if (!visited[i]) out[i * 4 + 3] = 255;
  return { data: out, bgPct: (bg / total * 100).toFixed(1) };
}

function processClan(clan) {
  const srcDir = path.join(SRC, clan.src);
  if (!existsSync(srcDir)) { console.log(`⚠️  clan dir missing: ${clan.src}`); return; }
  const mobileDst = path.join(ROOT, 'assets', 'pets', 'sprites', clan.out);
  const desktopDst = path.join(ROOT, 'desktop', 'public', 'pets', 'sprites',
    clan.out === 'default' ? 'default' : `clan-${clan.out}`);
  mkdirSync(mobileDst, { recursive: true });
  mkdirSync(desktopDst, { recursive: true });

  console.log(`\n=== ${clan.src} → ${clan.out} ===`);
  const files = readdirSync(srcDir).filter((f) => /\.png$/i.test(f) && !f.includes('\u5b9a\u5986')); // 跳过定妆
  let ok = 0;
  for (const file of files) {
    const action = normalizeAction(file);
    const frames = FRAMES[action];
    if (!frames) { console.log(`   skip ${file} (unknown action "${action}")`); continue; }
    const { data, width, height } = decode(readFileSync(path.join(srcDir, file)));
    const dw = frames * 256, dh = 256;
    const resized = resizeBilinear(data, width, height, dw, dh);
    const { data: keyed, bgPct } = floodFillBackground(resized, dw, dh);
    const buf = encode(keyed, dw, dh);
    writeFileSync(path.join(mobileDst, `${action}.png`), buf);
    writeFileSync(path.join(desktopDst, `${action}.png`), buf);
    console.log(`   ✅ ${action}.png ${dw}×${dh} bg=${bgPct}% (${(buf.length / 1024).toFixed(0)}KB) [from ${width}×${height}]`);
    ok++;
  }
  console.log(`   ${ok} actions processed`);
}

for (const clan of CLANS) processClan(clan);
console.log('\n=== Clan processing done ===');
