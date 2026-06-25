/**
 * Process Doubao-generated pet sprite PNGs:
 *   1. Read source PNG from deliverables/图片/<file>.png
 *   2. Replace white/near-white background with transparent
 *   3. Resize to target dimensions (256px height, N*256 width)
 *   4. Output to desktop/public/pets/sprites/default/<file>.png
 *
 * Usage:
 *   node scripts/pet/process-pet-sprites.mjs
 */
import sharp from 'sharp';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');

// Source files (豆包 generated, ~4-5K resolution, white background)
const SRC_DIR = path.join(ROOT, 'deliverables', '图片');
// Destination — Tauri public dir served as /pets/sprites/default/<file>
const DST_DIR = path.join(ROOT, 'desktop', 'public', 'pets', 'sprites', 'default');

// Target dimensions per sprite
const SPRITES = [
  { name: 'walk',  src: 'walk.png',  frames: 6, height: 256 },
  { name: 'idle',  src: 'idle.png',  frames: 4, height: 256 },
  { name: 'sleep', src: 'sleep.png', frames: 2, height: 256 },
  { name: 'sit',   src: 'sit.png',   frames: 1, height: 256 },
  { name: 'jump',  src: 'Jump.png',  frames: 4, height: 256 },
  { name: 'eat',   src: 'eat.png',   frames: 4, height: 256 },
];

// White-background → transparent threshold (R+G+B > THRESHOLD * 3 considered "white")
const WHITE_THRESHOLD = 240;
// Soft edge tolerance — pixels close to white but not pure get partial alpha
const SOFT_EDGE = 20;

async function makeWhiteTransparent(inputBuffer) {
  // Use sharp to extract raw RGBA, walk pixels, and re-encode as PNG.
  const { data, info } = await sharp(inputBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  const out = Buffer.from(data);

  for (let i = 0; i < out.length; i += channels) {
    const r = out[i];
    const g = out[i + 1];
    const b = out[i + 2];
    // Check if this pixel is "white-ish"
    const minRgb = Math.min(r, g, b);
    if (minRgb >= WHITE_THRESHOLD) {
      // Fully white → fully transparent
      out[i + 3] = 0;
    } else if (minRgb >= WHITE_THRESHOLD - SOFT_EDGE) {
      // Soft edge — partial alpha based on how close to white
      const alpha = Math.max(0, 255 - ((minRgb - (WHITE_THRESHOLD - SOFT_EDGE)) * 255 / SOFT_EDGE));
      out[i + 3] = Math.round(alpha);
    }
  }

  return sharp(out, { raw: { width, height, channels } })
    .png()
    .toBuffer();
}

async function processSprite(spec) {
  const srcPath = path.join(SRC_DIR, spec.src);
  const dstPath = path.join(DST_DIR, `${spec.name}.png`);

  // Check source exists
  try {
    await fs.access(srcPath);
  } catch {
    console.log(`⏭  ${spec.name}: source ${spec.src} not found, skipping`);
    return false;
  }

  console.log(`▶  ${spec.name}: processing ${spec.src}...`);

  // Step 1: read source
  const srcBuffer = await fs.readFile(srcPath);
  const srcMeta = await sharp(srcBuffer).metadata();
  console.log(`   source: ${srcMeta.width}x${srcMeta.height} ${srcMeta.format}`);

  // Step 2: remove white background → transparent
  const transparentBuffer = await makeWhiteTransparent(srcBuffer);

  // Step 3: resize to target dimensions
  const targetWidth = spec.frames * spec.height;
  const targetHeight = spec.height;
  const resized = await sharp(transparentBuffer)
    .resize(targetWidth, targetHeight, {
      fit: 'fill',  // exact dimensions; source already has correct aspect ratio
      kernel: 'lanczos3',
    })
    .png({ compressionLevel: 9 })
    .toBuffer();

  // Step 4: write output
  await fs.mkdir(DST_DIR, { recursive: true });
  await fs.writeFile(dstPath, resized);

  const outMeta = await sharp(resized).metadata();
  console.log(`   ✅ ${spec.name}.png: ${outMeta.width}x${outMeta.height} (${(resized.length / 1024).toFixed(1)} KB)`);
  return true;
}

async function main() {
  console.log('🎨 Processing pet sprite sheets...');
  console.log(`   src: ${SRC_DIR}`);
  console.log(`   dst: ${DST_DIR}`);
  console.log('');

  let ok = 0;
  let skipped = 0;
  for (const spec of SPRITES) {
    try {
      const success = await processSprite(spec);
      if (success) ok++; else skipped++;
    } catch (e) {
      console.error(`❌ ${spec.name}: ${e.message}`);
    }
  }

  console.log('');
  console.log(`🏁 Done: ${ok} processed, ${skipped} skipped`);
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
