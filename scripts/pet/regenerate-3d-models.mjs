/**
 * Regenerate all 3D pet models using the new "灵狐" sprite as reference.
 *
 * Workflow:
 *   1. Upload sit.png (256x256, transparent, the cleanest single-pose ref)
 *      to /upload/chat-attachment → get public URL
 *   2. For each model variant (default + marketplace pets), submit Hunyuan3D
 *      job with mode='image' and referenceImageUrl=<the uploaded URL>
 *   3. Poll until completion, save GLB URL + thumbnail to manifest
 *
 * Usage:
 *   set TEST_TOKEN=<jwt>  (or pass via env)
 *   node scripts/pet/regenerate-3d-models.mjs
 */
import { readFile, writeFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');

const API = process.env.API_BASE || 'https://api.agentrix.top/api';
const TOKEN = process.env.TEST_TOKEN || '';

if (!TOKEN) {
  console.error('❌ TEST_TOKEN env var required');
  console.error('   Get one from production: ssh + node /tmp/gen-token.js');
  process.exit(1);
}

const auth = { Authorization: `Bearer ${TOKEN}` };

// The reference image — use the cleanest single-pose sprite as the
// canonical character reference for all 3D generation jobs.
const REF_IMAGE_PATH = path.join(ROOT, 'desktop', 'public', 'pets', 'sprites', 'default', 'sit.png');

// All variants to regenerate. Each gets the SAME reference image so 3D
// models share the new character look.
const VARIANTS = [
  {
    id: 'kitsune-default-v3',
    type: 'default',
    description: 'Default living pet — soft pink/lavender chibi nine-tailed fox',
  },
  {
    id: 'kitsune-pro-v3',
    type: 'variant',
    description: 'Pro mode variant — same character, slightly more refined silhouette',
  },
  {
    id: 'kitsune-economy-v3',
    type: 'variant',
    description: 'Economy panel variant — same character, golden accent details',
  },
];

async function uploadReferenceImage() {
  console.log('📤 Uploading reference sprite as base for all 3D models...');
  const buf = await readFile(REF_IMAGE_PATH);
  // Build multipart/form-data body manually (node 20 has FormData/Blob)
  const blob = new Blob([buf], { type: 'image/png' });
  const fd = new FormData();
  fd.append('file', blob, 'kitsune-reference.png');
  const res = await fetch(`${API}/upload/chat-attachment`, {
    method: 'POST',
    headers: auth,
    body: fd,
  });
  if (!res.ok) {
    throw new Error(`Upload failed: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  // The response includes `url` (relative or absolute). Build public URL.
  const publicBase = API.replace(/\/api\/?$/, '');
  const url = data.url?.startsWith('http') ? data.url : `${publicBase}${data.url}`;
  console.log(`   ✅ Reference URL: ${url}`);
  return url;
}

async function submitGenerate(variant, refImageUrl) {
  console.log(`\n=== ${variant.id} ===`);
  console.log(`   ${variant.description}`);

  const res = await fetch(`${API}/pet-generation/submit`, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      mode: 'image',
      referenceImageUrl: refImageUrl,
      provider: 'hunyuan3d',
      style: 'chibi',
      enableAnimation: true,
      // Hunyuan3D blends image + prompt for fine-tuning
      prompt: `Q-version chibi fox companion, soft pink and lavender purple gradient fur, big sparkling violet eyes, three fluffy short tails (chibi), cute pose, premium designer toy quality, white background. ${variant.description}`,
    }),
  });
  if (!res.ok) {
    console.log(`   ❌ submit failed: ${res.status} ${await res.text()}`);
    return null;
  }
  const sd = await res.json();
  const taskId = sd.taskId || sd.task?.taskId;
  if (!taskId) {
    console.log(`   ❌ no taskId in response`);
    return null;
  }
  console.log(`   📋 taskId=${taskId}, polling...`);

  // Poll up to 10 minutes (Hunyuan3D usually finishes in 3-7 min)
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 10000));
    const pollRes = await fetch(`${API}/pet-generation/tasks/${taskId}`, { headers: auth });
    if (!pollRes.ok) {
      process.stdout.write('x');
      continue;
    }
    const data = await pollRes.json();
    process.stdout.write(data.status === 'processing' ? '.' : data.status[0]);
    if (data.status === 'completed' || data.status === 'failed') {
      console.log(` ${data.status}`);
      return {
        id: variant.id,
        type: variant.type,
        taskId,
        status: data.status,
        outputUrl: data.outputUrl,
        thumbnailUrl: data.thumbnailUrl,
        error: data.error,
      };
    }
  }
  console.log(' timeout');
  return { id: variant.id, taskId, status: 'timeout' };
}

async function main() {
  console.log('🐾 Regenerating 3D pet models with new sprite reference');
  console.log(`   API: ${API}`);
  console.log(`   Variants: ${VARIANTS.length}`);
  console.log('');

  const refUrl = await uploadReferenceImage();

  const results = [];
  // Hunyuan3D 1-concurrent limit, submit serially
  for (const variant of VARIANTS) {
    const r = await submitGenerate(variant, refUrl);
    if (r) results.push(r);
  }

  console.log('\n\n=== Summary ===');
  for (const r of results) {
    const mark = r.status === 'completed' ? '✅' : r.status === 'timeout' ? '⏰' : '❌';
    console.log(`  ${mark} ${r.id}: ${r.status}${r.outputUrl ? ` → ${r.outputUrl}` : ''}`);
  }

  const outPath = path.join(ROOT, 'deliverables', 'pet_3d_regen_v4.json');
  await writeFile(
    outPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        referenceImageUrl: refUrl,
        variants: VARIANTS,
        results,
      },
      null,
      2,
    ),
  );
  console.log(`\n📄 Saved manifest: ${outPath}`);
}

main().catch((e) => {
  console.error('💥 Fatal:', e);
  process.exit(1);
});
