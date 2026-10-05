/**
 * Generate marketplace pets v3 — diverse genres for different user personas.
 * Hunyuan3D 1-concurrent limit, submit serially.
 */
import { readFileSync, writeFileSync } from 'fs';

const token = readFileSync('tests/.e2e-token.txt', 'utf8').trim();
const API = 'https://api.agentrix.top/api';
const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

const PETS = [
  // --- Refined kitsune (default avatar) ---
  {
    id: 'default-kitsune-v3-final',
    type: 'default',
    price: 0,
    prompt: 'A premium quality kawaii Q-version chibi fox character. Very soft white and lavender purple gradient fur with subtle silver shimmer details. Oversized adorable head with big sparkling violet eyes featuring star-shaped highlights. Tiny pointed ears with pink inner color. Short fluffy tail with magical purple-to-cyan gradient at the tip. Sweet blushing cheeks. Wearing a tiny silver collar with a small bell. Standing in a confident cute pose with one paw raised in greeting. Style: high-end Japanese designer toy collectible (Pop Mart Molly quality), studio lighting on white background, photorealistic 3D render, ultra-detailed.',
  },
  // --- Marketplace: Office worker persona ---
  {
    id: 'marketplace-coffee-bear',
    type: 'marketplace',
    clan: 'A',
    price: 800,
    prompt: 'An adorable chibi brown bear mascot for office workers. Soft caramel brown fluffy fur with a creamy white belly. Big round innocent eyes with coffee-bean shaped highlights. Tiny round ears. Holding a cute miniature coffee cup with steam rising. Wearing a small business tie around its neck. Sitting in a relaxed pose. Pop Mart designer toy style, premium 3D render, white studio background.',
  },
  // --- Marketplace: Student persona ---
  {
    id: 'marketplace-study-owl',
    type: 'marketplace',
    clan: 'C',
    price: 600,
    prompt: 'A super cute chibi owl character for students. Soft cream and beige feathers with small star patterns. Huge round green eyes with sparkle highlights wearing tiny round black-rimmed scholar glasses. Small triangular orange beak. Holding an open mini book with one wing. Sitting on a tiny stack of books. Kawaii designer toy style, premium 3D render, bright white background.',
  },
  // --- Marketplace: Web3 / Crypto persona ---
  {
    id: 'marketplace-crypto-shiba',
    type: 'marketplace',
    clan: 'E',
    price: 1500,
    prompt: 'An adorable chibi shiba inu dog with a Web3 crypto theme. Golden orange fur with white belly markings. Big black sparkling eyes with golden coin reflections. Tiny pointed ears. Wearing a small futuristic LED collar with glowing geometric patterns. Sitting on top of a tiny golden coin pile with a smug satisfied expression. Tongue slightly out. Pop Mart designer toy quality, premium 3D render, clean dark background with subtle golden particles.',
  },
  // --- Marketplace: Family / Cute persona ---
  {
    id: 'marketplace-cloud-sheep',
    type: 'marketplace',
    clan: 'F',
    price: 700,
    prompt: 'An extremely adorable chibi sheep character. Pure white fluffy cloud-like wool body with extra puffiness. Tiny black face with huge round innocent eyes and tiny black hooves. Small horns barely visible in the fluffy wool. Pink blush cheeks. Floating on a tiny white cloud. Looking up with a peaceful sleepy expression. Premium kawaii designer toy 3D render, soft pastel sky blue background, gentle lighting.',
  },
];

async function submitAndPoll(pet) {
  console.log(`\n=== Submitting ${pet.id} (${pet.type}, $${pet.price} AXP) ===`);
  const sub = await fetch(`${API}/pet-generation/submit`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ mode: 'text', prompt: pet.prompt, provider: 'hunyuan3d', style: 'chibi', enableAnimation: true }),
  });
  if (!sub.ok) { return { id: pet.id, status: 'submit_failed' }; }
  const sd = await sub.json();
  const taskId = sd.taskId || sd.task?.taskId;
  if (!taskId) { return { id: pet.id, status: 'no_taskId' }; }
  console.log(`  taskId=${taskId}, polling (every 10s, max 5min)...`);

  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 10000));
    const res = await fetch(`${API}/pet-generation/tasks/${taskId}`, { headers });
    if (!res.ok) { process.stdout.write('x'); continue; }
    const data = await res.json();
    process.stdout.write(data.status === 'processing' ? '.' : data.status[0]);
    if (data.status === 'completed' || data.status === 'failed') {
      console.log(` ${data.status}`);
      return {
        id: pet.id, taskId, status: data.status,
        type: pet.type, clan: pet.clan, price: pet.price,
        outputUrl: data.outputUrl, thumbnailUrl: data.thumbnailUrl, error: data.error,
      };
    }
  }
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

const outPath = process.cwd() + '/../deliverables/pet_marketplace_v3.json';
writeFileSync(outPath, JSON.stringify({ pets: PETS, results, generatedAt: new Date().toISOString() }, null, 2));
console.log(`\nSaved: ${outPath}`);
