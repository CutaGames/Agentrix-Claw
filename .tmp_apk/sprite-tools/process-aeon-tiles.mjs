// Process Aeon ground tiles delivered by Doubao:
//  1) erase the "豆包AI生成" watermark (bottom-right corner) → transparent
//  2) trim fully-transparent margins, then center on a square canvas
//  3) write to assets/aeon/tiles/<name>.png at a standard size
//
// The tiles already have transparent backgrounds; the watermark is opaque text
// in the bottom-right. We clear a bottom-right rectangle to transparent. Since
// the tile art is centered and doesn't reach the extreme bottom-right corner,
// this removes the watermark without touching the tile.
import { PNG } from 'pngjs';
import fs from 'fs';
import path from 'path';

const SRC_DIR = path.resolve('../../deliverables/图片/agentrix-world');
const OUT_DIR = path.resolve('../../assets/aeon/tiles');
const OUT_SIZE = 512; // tiles render small; 512 keeps file size sane

// catalogId mapping for the 6 single tiles (order per AEON_ART brief §A):
// 1 base, 2 glow-edge, 3 road, 4 grass, 5 water, 6 edge/float
const MAP = {
  '单块地转1': 'floor-base',
  '单块地转2': 'floor-glow',
  '单块地转3': 'floor-road',
  '单块地转4': 'floor-grass',
  '单块地转5': 'floor-water',
  '单块地转6': 'floor-edge',
};

function loadPng(p) {
  return PNG.sync.read(fs.readFileSync(p));
}

// Clear a bottom-right rectangle to transparent (watermark zone).
// Watermark "豆包AI生成" occupies roughly the bottom ~7% height and right ~32% width.
function eraseWatermark(png) {
  const { width, height, data } = png;
  const x0 = Math.floor(width * 0.62);
  const y0 = Math.floor(height * 0.92);
  for (let y = y0; y < height; y++) {
    for (let x = x0; x < width; x++) {
      const idx = (width * y + x) << 2;
      data[idx + 3] = 0; // alpha → 0
    }
  }
}

// Find bounding box of non-transparent pixels (alpha > threshold).
function contentBounds(png, aThresh = 16) {
  const { width, height, data } = png;
  let minX = width, minY = height, maxX = 0, maxY = 0, found = false;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const a = data[((width * y + x) << 2) + 3];
      if (a > aThresh) {
        found = true;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (!found) return { minX: 0, minY: 0, maxX: width - 1, maxY: height - 1 };
  return { minX, minY, maxX, maxY };
}

// Nearest-neighbour resize of a cropped region into a square OUT_SIZE canvas,
// preserving aspect ratio (letterboxed transparent).
function cropResizeSquare(png, b, out = OUT_SIZE) {
  const cw = b.maxX - b.minX + 1;
  const ch = b.maxY - b.minY + 1;
  const scale = Math.min(out / cw, out / ch);
  const dw = Math.max(1, Math.round(cw * scale));
  const dh = Math.max(1, Math.round(ch * scale));
  const offX = Math.floor((out - dw) / 2);
  const offY = Math.floor((out - dh) / 2);
  const dst = new PNG({ width: out, height: out });
  dst.data.fill(0);
  for (let y = 0; y < dh; y++) {
    for (let x = 0; x < dw; x++) {
      const sx = b.minX + Math.min(cw - 1, Math.floor(x / scale));
      const sy = b.minY + Math.min(ch - 1, Math.floor(y / scale));
      const si = (png.width * sy + sx) << 2;
      const di = (out * (y + offY) + (x + offX)) << 2;
      dst.data[di] = png.data[si];
      dst.data[di + 1] = png.data[si + 1];
      dst.data[di + 2] = png.data[si + 2];
      dst.data[di + 3] = png.data[si + 3];
    }
  }
  return dst;
}

fs.mkdirSync(OUT_DIR, { recursive: true });
let n = 0;
for (const [src, outName] of Object.entries(MAP)) {
  const srcPath = path.join(SRC_DIR, `${src}.png`);
  if (!fs.existsSync(srcPath)) {
    console.warn(`SKIP missing ${srcPath}`);
    continue;
  }
  const png = loadPng(srcPath);
  eraseWatermark(png);
  const b = contentBounds(png);
  const out = cropResizeSquare(png, b);
  const outPath = path.join(OUT_DIR, `${outName}.png`);
  fs.writeFileSync(outPath, PNG.sync.write(out));
  console.log(`OK ${src}.png → ${outName}.png (crop ${b.maxX - b.minX + 1}x${b.maxY - b.minY + 1} → ${OUT_SIZE})`);
  n++;
}
console.log(`done: ${n} tiles → ${OUT_DIR}`);
