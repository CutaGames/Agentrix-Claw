/**
 * Regenerate the living variant since the original COS signed URL has expired.
 */
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const token = readFileSync('tests/.e2e-token.txt', 'utf8').trim();
const API = 'https://api.agentrix.top/api';
const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

const basePrompt =
  'A cute digital fox spirit mascot for Agentrix AI platform. Indigo blue body with glowing cyan accents, large expressive eyes, pointed ears with light tips, semi-transparent flowing tail like aurora. Chibi proportions, friendly and magical appearance.';
const prompt = `${basePrompt} Form variant (living): Curled up sleeping pose, round and soft, eyes half-closed, tail wrapped around body, gentle glow, kawaii style, peaceful`;

console.log('Submitting living variant…');
const sub = await fetch(`${API}/pet-generation/submit`, {
  method: 'POST',
  headers,
  body: JSON.stringify({ mode: 'text', prompt, provider: 'hunyuan3d', style: 'chibi', enableAnimation: true }),
});
const sd = await sub.json();
const taskId = sd.taskId || sd.task?.taskId;
if (!taskId) {
  console.error('No taskId:', sd);
  process.exit(1);
}
console.log('  taskId =', taskId);

for (let i = 0; i < 30; i++) {
  await new Promise((r) => setTimeout(r, 10_000));
  const res = await fetch(`${API}/pet-generation/tasks/${taskId}`, { headers });
  const data = await res.json();
  console.log(`  poll ${i + 1}: ${data.status}`);
  if (data.status === 'completed' || data.status === 'failed') {
    const out = {
      mode: 'living',
      taskId,
      status: data.status,
      outputUrl: data.outputUrl,
      thumbnailUrl: data.thumbnailUrl,
      error: data.error,
    };
    const path = join(process.cwd(), '..', 'deliverables', 'pet_generation_living_v2.json');
    writeFileSync(path, JSON.stringify(out, null, 2));
    console.log('Saved:', path);
    process.exit(data.status === 'completed' ? 0 : 1);
  }
}
console.error('Timed out');
process.exit(2);
