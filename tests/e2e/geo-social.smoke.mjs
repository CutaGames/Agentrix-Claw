/**
 * geo-social.smoke.mjs — 地理社交端到端冒烟(圈地/附近/签到+AXP)。
 *
 * 自包含(后端机 backend 目录跑):
 *   1) 在随机真实坐标圈一块地
 *   2) GET plots/nearby?lat&lng → 能查到刚圈的地,带 distanceM(很小)+ mine=true
 *   3) POST plots/:id/checkin(同坐标,距离 0)→ rewardAxp=15 + bridged + 钱包+15
 *   4) 再 checkin 一次 → alreadyCheckedInToday=true, reward=0
 * 退出码 0=PASS。
 */
import http from 'node:http';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire('/home/ubuntu/Agentrix/backend/');
const { Client } = require('pg');
const jwt = require('jsonwebtoken');
const API = 'http://localhost:3000/api/v1/aeon/plots';
function call(method, path, token, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const u = new URL(path);
    const r = http.request({ hostname: u.hostname, port: u.port, path: u.pathname + u.search, method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}) } },
      (res) => { let b=''; res.on('data',c=>b+=c); res.on('end',()=>resolve({status:res.statusCode, body:b?JSON.parse(b):null})); });
    r.on('error', reject); if (data) r.write(data); r.end();
  });
}
(async () => {
  const env = fs.readFileSync('/home/ubuntu/Agentrix/backend/.env','utf8');
  const g = (k) => { const l = env.split('\n').find(x=>x.startsWith(k+'=')); return l?l.slice(k.length+1).trim():''; };
  const c = new Client({ host:g('DB_HOST')||'localhost', port:Number(g('DB_PORT')||5432), user:g('DB_USERNAME'), password:g('DB_PASSWORD'), database:g('DB_DATABASE')||'paymind' });
  await c.connect();
  const u = (await c.query('SELECT id FROM users ORDER BY created_at ASC LIMIT 1')).rows[0];
  const before = Number((await c.query('SELECT balance FROM user_axp_balances WHERE user_id=$1', [u.id])).rows[0]?.balance ?? 0);
  await c.end();
  const token = jwt.sign({ sub:u.id, id:u.id, userId:u.id }, g('JWT_SECRET'), { expiresIn:'1h' });

  // 随机坐标避免格子冲突
  const lat = 1.2 + Math.random() * 0.5;
  const lng = 103.6 + Math.random() * 0.5;
  const claim = await call('POST', `${API}/claim`, token, { lat, lng, displayName: '地理冒烟领地' });
  console.log('claim.status='+claim.status+' id='+(claim.body&&claim.body.id));
  const plotId = claim.body && claim.body.id;
  if (!plotId) { console.log('FAIL claim', JSON.stringify(claim.body)); process.exit(1); }

  const near = await call('GET', `${API}/nearby?lat=${lat}&lng=${lng}&radiusM=2000`, token);
  const found = (near.body?.items||[]).find(p => p.id === plotId);
  console.log('nearby.status='+near.status+' count='+(near.body?.items||[]).length+' foundDist='+(found&&found.distanceM)+' mine='+(found&&found.mine));

  const chk = await call('POST', `${API}/${plotId}/checkin`, token, { lat, lng });
  console.log('checkin.status='+chk.status+' reward='+(chk.body&&chk.body.rewardAxp)+' bridged='+(chk.body&&chk.body.bridged));

  const chk2 = await call('POST', `${API}/${plotId}/checkin`, token, { lat, lng });
  console.log('checkin2.alreadyToday='+(chk2.body&&chk2.body.alreadyCheckedInToday)+' reward='+(chk2.body&&chk2.body.rewardAxp));

  const c2 = new Client({ host:g('DB_HOST')||'localhost', port:Number(g('DB_PORT')||5432), user:g('DB_USERNAME'), password:g('DB_PASSWORD'), database:g('DB_DATABASE')||'paymind' });
  await c2.connect();
  const after = Number((await c2.query('SELECT balance FROM user_axp_balances WHERE user_id=$1', [u.id])).rows[0]?.balance ?? 0);
  await c2.end();
  console.log('balance before='+before+' after='+after+' delta='+(after-before));

  const ok = claim.status === 201 && !!found && found.mine === true && found.distanceM < 50
    && chk.status === 201 && chk.body.rewardAxp === 15
    && chk2.body.alreadyCheckedInToday === true && chk2.body.rewardAxp === 0
    && (!chk.body.bridged || after - before === 15);
  console.log(ok ? 'PASS: geo-social (claim/nearby/checkin+AXP) works' : 'FAIL: geo-social');
  process.exit(ok?0:1);
})().catch(e=>{ console.error('ERR', e.message); process.exit(1); });
