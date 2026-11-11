/**
 * Resubmit failed pet variants (Pro + Economy) serially.
 * Tencent Hunyuan3D has a 1-concurrent-job limit.
 *
 * Usage:
 *   cd desktop && node tests/resubmit-pet-variants.mjs
 */
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const token = readFileSync('tests/.e2e-token.txt', 'utf8').trim();
const API = 'https://api.agentrix.top/api';
const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

const basePrompt =
  'A cute digital fox spirit mascot for Agentrix AI platform. Indigo blue body with glowing cyan accents, large expressive eyes, pointed ears with light tips, semi-transparent flowing tail like aurora. Chibi proportions, friendly and magical appearance.';

const variants = [
  {
    mode: 'pro',
    modifier:
      'Standing tall and alert, sleek proportions, holographic data streams floating around, focused sharp eyes, glowing symbols orbiting, professional confident pose',
  },
  {
    mode: 'economy',
    modifier:
      'Slightly plump and satisfied, wearing a tiny golden top hat, holding a glowing gem in one paw, smug happy expression, golden sparkles, merchant style',
  },
];

async function pollUntilDone(taskId, label) {
  // Poll every 10s, up to 5 minutes
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 10_000));
    const res = await fetch(`${API}/pet-generation/tasks/${taskId}`, { headers });
    if (!res.ok) {
      console.log(`  [${label}] poll ${i + 1}: HTTP ${res.status}`);
      continue;
    }
    const data = await res.json();
    const status = data.status;
    console.log(`  [${label}] poll ${i + 1}: status=${status}`);
    if (status === 'completed' || status === 'failed') {
      return data;
    }
  }
  return null;
}

const results = [];
for (const v of variants) {
  const prompt = `${basePrompt} Form variant (${v.mode}): ${v.modifier}`;
  console.log(`\n=== Submitting ${v.mode} variant ===`);
  const submitRes = await fetch(`${API}/pet-generation/submit`, {
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
  if (!submitRes.ok) {
    const t = await submitRes.text();
    console.log(`  ❌ submit failed: ${submitRes.status} ${t.substring(0, 200)}`);
    results.push({ mode: v.mode, error: `submit failed: ${submitRes.status}` });
    continue;
  }
  const sd = await submitRes.json();
  const taskId = sd.taskId || sd.task?.taskId;
  if (!taskId) {
    console.log(`  ❌ no taskId in response: ${JSON.stringify(sd).substring(0, 200)}`);
    results.push({ mode: v.mode, error: 'no taskId' });
    continue;
  }
  console.log(`  ✅ taskId=${taskId}, polling...`);

  const final = await pollUntilDone(taskId, v.mode);
  if (!final) {
    console.log(`  ⏱️ ${v.mode} polling timed out`);
    results.push({ mode: v.mode, taskId, status: 'timeout' });
    continue;
  }
  results.push({
    mode: v.mode,
    taskId,
    status: final.status,
    outputUrl: final.outputUrl,
    thumbnailUrl: final.thumbnailUrl,
    error: final.error,
  });
  console.log(`  ${final.status === 'completed' ? '✅' : '❌'} ${v.mode}: ${final.status}`);
}

const out = {
  basePrompt,
  resubmittedAt: new Date().toISOString(),
  variants: results,
};
const path = join(process.cwd(), '..', 'deliverables', 'pet_generation_resubmit.json');
writeFileSync(path, JSON.stringify(out, null, 2));
console.log('\n=== Summary ===');
console.log(JSON.stringify(out, null, 2));
console.log(`\n📝 Saved: ${path}`);
