/**
 * process-aeon-art.mjs — Aeon(永曜城)世界美术处理(2026-06-01)。
 *
 * 输入:deliverables/图片/agentrix-world/*.png(豆包出图,2048² 建筑 + 2732×1534 房间,
 *        全为不透明 Format24bppRgb)。
 * 处理:
 *   - 建造单体(10 个):corner-seed flood-fill 去背(晨昏渐变底)→ 透明 → resize 到 512²
 *     (大型 hq-tower/stage-dome/meeting-pod → 768²)。
 *   - 房间背景(5 个):不去背(本就是背景),只 resize 到 1280×720。
 * 输出:assets/aeon/build/<catalogId>.png(透明)、assets/aeon/rooms/room-<kind>.png。
 *       同时复制到 desktop/public/aeon/* 供桌面端复用。
 *
 * 去背阈值比宠物宽松:豆包建筑底是晨昏暖色渐变(非纯白),corner flood-fill 用
 * "与四角种子色相近"判定而非纯白阈值,避免吃掉建筑发光边缘。
 */
import { PNG } from 'pngjs';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const SRC = path.join(ROOT, 'deliverables', '\u56fe\u7247', 'agentrix-world');
const BUILD_DST = path.join(ROOT, 'assets', 'aeon', 'build');
const ROOM_DST = path.join(ROOT, 'assets', 'aeon', 'rooms');
const DESKTOP_BUILD = path.join(ROOT, 'desktop', 'public', 'aeon', 'build');
const DESKTOP_ROOM = path.join(ROOT, 'desktop', 'public', 'aeon', 'rooms');

// 建造单体:catalogId → 输出边长
const BUILDINGS = [
  { id: 'hq-tower', size: 768 },
  { id: 'task-board', size: 512 },
  { id: 'market-stall', size: 512 },
  { id: 'stage-dome', size: 768 },
  { id: 'meeting-pod', size: 768 },
  { id: 'plaza-tree', size: 512 },
  { id: 'lamp-post', size: 512 },
  { id: 'fountain', size: 512 },
  { id: 'gate-arch', size: 512 },
  { id: 'hologram', size: 512 },
];

// 房间背景:room-<kind>,输出 1280×720(16:9)
const ROOMS = ['company', 'meeting', 'venue', 'market', 'public'];

function decode(buf) {
  const p = PNG.sync.read(buf);
  return { data: p.data, width: p.width, height: p.height };
}
function encode(rgba, w, h) {
  const png = new PNG({ width: w, height: h, colorType: 6 });
  png.data = Buffer.from(rgba);
  return PNG.sync.write(png);
}
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
        const v00 = data[(y0 * sw + x0) * 4 + c];
        const v10 = data[(y0 * sw + x1) * 4 + c];
        const v01 = data[(y1 * sw + x0) * 4 + c];
        const v11 = data[(y1 * sw + x1) * 4 + c];
        const top = v00 + (v10 - v00) * fx;
        const bot = v01 + (v11 - v01) * fx;
        out[di + c] = Math.round(top + (bot - top) * fy);
      }
    }
  }
  return out;
}

/**
 * Corner-seed flood-fill 去背:用四角像素作为"背景色样本",对与样本色差
 * 在容差内、且与角 4-连通的像素置 alpha=0。容差用感知距离(maxabs 通道差)。
 * 比纯白阈值稳健,适配晨昏渐变底;建筑主体颜色与背景差异大,不会被吃。
 */
function floodFillBackground(data, w, h, tol = 38) {
  const out = Buffer.from(data);
  const total = w * h;
  const visited = new Uint8Array(total);
  const stack = [];
  // 四角种子色(取平均做参考)
  const corners = [0, (w - 1), (h - 1) * w, (h - 1) * w + (w - 1)];
  const seeds = corners.map((i) => [data[i * 4], data[i * 4 + 1], data[i * 4 + 2]]);
  const near = (idx) => {
    const r = data[idx * 4], g = data[idx * 4 + 1], b = data[idx * 4 + 2];
    return seeds.some(([sr, sg, sb]) =>
      Math.abs(r - sr) <= tol && Math.abs(g - sg) <= tol && Math.abs(b - sb) <= tol);
  };
  for (const c of corners) if (near(c)) stack.push(c);
  let bg = 0;
  while (stack.length) {
    const idx = stack.pop();
    if (visited[idx]) continue;
    if (!near(idx)) continue;
    visited[idx] = 1;
    out[idx * 4 + 3] = 0;
    bg++;
    const x = idx % w, y = (idx / w) | 0;
    if (x > 0) stack.push(idx - 1);
    if (x < w - 1) stack.push(idx + 1);
    if (y > 0) stack.push(idx - w);
    if (y < h - 1) stack.push(idx + w);
  }
  for (let i = 0; i < total; i++) if (!visited[i]) out[i * 4 + 3] = 255;
  return { data: out, bgPct: (bg / total * 100).toFixed(1) };
}

function processBuilding(b) {
  const srcPath = path.join(SRC, `${b.id}.png`);
  if (!existsSync(srcPath)) { console.log(`⚠️  ${b.id}.png missing`); return false; }
  const { data, width, height } = decode(readFileSync(srcPath));
  // 先去背(原分辨率,保边缘精度)再缩放
  const { data: keyed, bgPct } = floodFillBackground(data, width, height);
  const resized = resizeBilinear(keyed, width, height, b.size, b.size);
  const buf = encode(resized, b.size, b.size);
  mkdirSync(BUILD_DST, { recursive: true });
  mkdirSync(DESKTOP_BUILD, { recursive: true });
  writeFileSync(path.join(BUILD_DST, `${b.id}.png`), buf);
  writeFileSync(path.join(DESKTOP_BUILD, `${b.id}.png`), buf);
  console.log(`✅ build/${b.id}.png ${b.size}² bg=${bgPct}% ${(buf.length / 1024).toFixed(0)}KB`);
  return true;
}

function processRoom(kind) {
  const srcPath = path.join(SRC, `room-${kind}.png`);
  if (!existsSync(srcPath)) { console.log(`⚠️  room-${kind}.png missing`); return false; }
  const { data, width, height } = decode(readFileSync(srcPath));
  const dw = 1280, dh = 720;
  const resized = resizeBilinear(data, width, height, dw, dh);
  // 背景保持不透明
  for (let i = 0; i < dw * dh; i++) resized[i * 4 + 3] = 255;
  const buf = encode(resized, dw, dh);
  mkdirSync(ROOM_DST, { recursive: true });
  mkdirSync(DESKTOP_ROOM, { recursive: true });
  writeFileSync(path.join(ROOM_DST, `room-${kind}.png`), buf);
  writeFileSync(path.join(DESKTOP_ROOM, `room-${kind}.png`), buf);
  console.log(`✅ rooms/room-${kind}.png ${dw}×${dh} ${(buf.length / 1024).toFixed(0)}KB`);
  return true;
}

console.log('=== Aeon buildings (flood-fill + resize) ===');
let okB = 0; for (const b of BUILDINGS) if (processBuilding(b)) okB++;
console.log(`\n=== Aeon rooms (resize) ===`);
let okR = 0; for (const k of ROOMS) if (processRoom(k)) okR++;
console.log(`\n=== Done: ${okB}/${BUILDINGS.length} buildings, ${okR}/${ROOMS.length} rooms ===`);
