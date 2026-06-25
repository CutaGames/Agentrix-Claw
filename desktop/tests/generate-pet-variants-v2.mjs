/**
 * Generate:
 * 1. Kitsune fox 3 color variants (A/B/C) for comparison
 * 2. 3 marketplace pets (Nebula cat, Mecha rabbit, Prism dragon)
 * 
 * Hunyuan3D has 1-concurrent-job limit, so we submit serially with polling.
 */
import { readFileSync, writeFileSync } from 'fs';

const token = readFileSync('tests/.e2e-token.txt', 'utf8').trim();
const API = 'https://api.agentrix.top/api';
const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

const PETS = [
  // --- Kitsune color variants ---
  {
    id: 'kitsune-A-white-purple',
    prompt: 'A cute chibi fox spirit mascot. White and light gray body with gradient purple-tipped ears and tail. Large glowing cyan eyes. Semi-transparent aurora-like flowing tail with purple to cyan gradient. Soft fur texture. Friendly kawaii expression. Standing pose on hind legs. Clean white background for 3D model.',
  },
  {
    id: 'kitsune-B-crystal-tech',
    prompt: 'A cute chibi fox spirit mascot with semi-transparent crystal body. Internal glowing circuit patterns visible through the translucent skin. Indigo and cyan color scheme. Tail made of flowing data streams and light particles. Large expressive eyes with holographic iris. Futuristic tech aesthetic. Standing pose. Clean background.',
  },
  {
    id: 'kitsune-C-round-qversion',
    prompt: 'An extremely cute round chibi fox mascot with oversized head and tiny body (Molly blind box proportions). Soft pastel lavender and white fur. Big sparkly eyes taking up half the face. Tiny pointed ears with pink inner. Short fluffy tail. Blushing cheeks. Sitting pose. Kawaii Japanese toy style. Clean background.',
  },
  // --- Marketplace pets ---
  {
    id: 'marketplace-nebula-cat',
    prompt: 'A cute chibi space cat with galaxy nebula pattern fur. Deep purple and blue body with swirling star patterns. Glowing golden eyes like distant suns. Tail trails stardust particles. Small cosmic crown floating above head. Sitting pose looking curious. Anime mascot style. Clean dark background.',
  },
  {
    id: 'marketplace-mecha-rabbit',
    prompt: 'A cute chibi cyberpunk robot rabbit. Metallic silver and gunmetal body with visible mechanical joints. One eye is a glowing red LED scanner. Long ears are antenna with blue LED tips. Small jetpack on back. Confident standing pose. Neon accents. Clean background.',
  },
  {
    id: 'marketplace-prism-dragon',
    prompt: 'A cute baby dragon made of translucent crystal prism material. Rainbow light refracts through its body creating colorful patterns. Small wings catching light. Large innocent eyes. Tiny horns. Sitting on its tail looking up. Magical sparkles around it. Fantasy kawaii style. Clean background.',
  },
];

async function submitAndPoll(pet) {
  console.log(`\n=== ${pet.id} ===`);
  const sub = await fetch(`${API}/pet-generation/submit`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ mode: 'text', prompt: pet.prompt, provider: 'hunyuan3d', style: 'chibi', enableAnimation: true }),
  });
  if (!sub.ok) {
    const t = await sub.text();
    console.log(`  ❌ submit: ${sub.status} ${t.substring(0, 100)}`);
    return { id: pet.id, status: 'submit_failed', error: t.substring(0, 100) };
  }
  const sd = await sub.json();
  const taskId = sd.taskId || sd.task?.taskId;
  if (!taskId) { console.log('  ❌ no taskId'); return { id: pet.id, status: 'no_taskId' }; }
  console.log(`  taskId=${taskId}, polling...`);

  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 10000));
    const res = await fetch(`${API}/pet-generation/tasks/${taskId}`, { headers });
    if (!res.ok) { process.stdout.write('x'); continue; }
    const data = await res.json();
    process.stdout.write(data.status === 'processing' ? '.' : data.status[0]);
    if (data.status === 'completed' || data.status === 'failed') {
      console.log(` ${data.status}`);
      return { id: pet.id, taskId, status: data.status, outputUrl: data.outputUrl, thumbnailUrl: data.thumbnailUrl, error: data.error };
    }
  }
  console.log(' timeout');
  return { id: pet.id, taskId, status: 'timeout' };
}

const results = [];
for (const pet of PETS) {
  const r = await submitAndPoll(pet);
  results.push(r);
}

console.log('\n\n=== SUMMARY ===');
for (const r of results) {
  const mark = r.status === 'completed' ? '✅' : '❌';
  console.log(`  ${mark} ${r.id}: ${r.status}`);
}

const outPath = process.cwd() + '/../deliverables/pet_variants_v2.json';
writeFileSync(outPath, JSON.stringify({ pets: PETS, results, generatedAt: new Date().toISOString() }, null, 2));
console.log(`\nSaved: ${outPath}`);
