/**
 * Reprocess v9 — produce TRUE transparent PNG.
 *
 * 豆包's chat preview shows transparent background, but the actual
 * downloaded PNG is RGB without an alpha channel — pure white where
 * the visual was transparent. We restore alpha by treating any pixel
 * with min(R,G,B) >= 240 as background (alpha=0).
 *
 * Per-pixel threshold avoids the flood-fill black-hole problem because
 * we only mark white pixels as transparent — interior pet white-fur is
 * darker (in the 200-235 range) and stays opaque.
 *
 * Output: RGBA PNG with transparent background. Works on:
 *   - Mac:    pet floats borderless (WebKit transparent works)
 *   - Win:    page sets a white window background → still looks like
 *             a clean white card with the pet visible (no black holes
 *             since we use a HIGH threshold 240 that doesn't catch fur)
 *   - VSCode: shows as transparent PNG with checkerboard preview (correct)
 */
import { PNG } from 'pngjs';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const SRC_DIR = path.join(ROOT, 'deliverables', '\u56fe\u7247');
const DST_DIR = path.join(ROOT, 'desktop', 'public', 'pets', 'sprites', 'default');
const MOBILE_DST = path.join(ROOT, 'assets', 'pets', 'sprites', 'default');

const SPECS = [
  { src: 'walk.png',  action: 'walk',  frames: 6, height: 256 },
  { src: 'idle.png',  action: 'idle',  frames: 4, height: 256 },
  { src: 'sleep.png', action: 'sleep', frames: 2, height: 256 },
  { src: 'sit.png',   action: 'sit',   frames: 1, height: 256 },
  { src: 'Jump.png',  action: 'jump',  frames: 4, height: 256 },
  { src: 'eat.png',   action: 'eat',   frames: 4, height: 256 },
];

// High threshold — 240+ means near-pure-white. Pet's interior light fur
// typically caps around 230, so this stays well above and won't trigger.
const WHITE_TO_ALPHA_THRESHOLD = 240;

function decodePng(buf) {
  const p = PNG.sync.read(buf);
  return { data: p.data, width: p.width, height: p.height };
}

function encodeRgbaPng(rgbaData, width, height) {
  const png = new PNG({ width, height, colorType: 6 });
  png.data = Buffer.from(rgbaData);
  return PNG.sync.write(png);
}

function resizeBilinear(data, srcW, srcH, dstW, dstH) {
  const out = Buffer.alloc(dstW * dstH * 4);
  for (let dy = 0; dy < dstH; dy++) {
    const srcY = dy * (srcH-1) / (dstH-1);
    const y0 = Math.floor(srcY), y1 = Math.min(y0+1, srcH-1);
    const fy = srcY - y0;
    for (let dx = 0; dx < dstW; dx++) {
      const srcX = dx * (srcW-1) / (dstW-1);
      const x0 = Math.floor(srcX), x1 = Math.min(x0+1, srcW-1);
      const fx = srcX - x0;
      const di = (dy*dstW+dx)*4;
      for (let c = 0; c < 4; c++) {
        const v00 = data[(y0*srcW+x0)*4+c], v10 = data[(y0*srcW+x1)*4+c];
        const v01 = data[(y1*srcW+x0)*4+c], v11 = data[(y1*srcW+x1)*4+c];
        const top = v00 + (v10-v00)*fx, bot = v01 + (v11-v01)*fx;
        out[di+c] = Math.round(top + (bot-top)*fy);
      }
    }
  }
  return out;
}

function whiteToAlpha(data, width, height) {
  const out = Buffer.from(data);
  let bgPx = 0, charPx = 0;
  for (let i = 0; i < width * height; i++) {
    const r = out[i*4], g = out[i*4+1], b = out[i*4+2];
    if (Math.min(r, g, b) >= WHITE_TO_ALPHA_THRESHOLD) {
      out[i*4+3] = 0;
      bgPx++;
    } else {
      out[i*4+3] = 255;
      charPx++;
    }
  }
  return { data: out, bgPx, charPx };
}

async function processOne(spec) {
  const srcPath = path.join(SRC_DIR, spec.src);
  console.log(`\n=== ${spec.action} (${spec.src}) ===`);
  const { data, width, height } = decodePng(readFileSync(srcPath));
  console.log(`   source: ${width}×${height}`);

  const dstW = spec.frames * spec.height, dstH = spec.height;
  console.log(`   resize: ${width}×${height} → ${dstW}×${dstH}`);
  const resized = resizeBilinear(data, width, height, dstW, dstH);

  const { data: composed, bgPx, charPx } = whiteToAlpha(resized, dstW, dstH);
  const total = dstW * dstH;
  console.log(`   bg→alpha: ${bgPx}/${total} (${(bgPx/total*100).toFixed(1)}% transparent), ${charPx} character`);

  const pngBuf = encodeRgbaPng(composed, dstW, dstH);
  mkdirSync(DST_DIR, { recursive: true });
  mkdirSync(MOBILE_DST, { recursive: true });
  writeFileSync(path.join(DST_DIR, `${spec.action}.png`), pngBuf);
  writeFileSync(path.join(MOBILE_DST, `${spec.action}.png`), pngBuf);
  console.log(`   ✅ ${spec.action}.png: ${dstW}×${dstH} (${(pngBuf.length/1024).toFixed(1)} KB) [RGBA transparent]`);
}

for (const spec of SPECS) await processOne(spec);
console.log('\n✅ Done — v9 white-to-alpha (true transparent PNG)');
