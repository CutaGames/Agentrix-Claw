/**
 * geo-social-2.smoke.mjs — 地理社交 Phase 2 端到端冒烟。
 *
 * 覆盖:nearby-people(两用户互见)、POI 入驻(marker 带 poiName)、签到连续天数(streakDays)、打卡排行。
 * 自包含(后端机 backend 目录跑):node tests/e2e/geo-social-2.smoke.mjs
 * 2026-06-03 跑通(单用户路径:nearby-people 201、poi 冒烟小馆、streak=1、leaderboard≥1)。
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
  const us = (await c.query('SELECT id FROM users ORDER BY created_at ASC LIMIT 2')).rows;
  await c.end();
  const tokenA = jwt.sign({ sub:us[0].id, id:us[0].id, userId:us[0].id }, g('JWT_SECRET'), { expiresIn:'1h' });
  const tokenB = jwt.sign({ sub:us[1].id, id:us[1].id, userId:us[1].id }, g('JWT_SECRET'), { expiresIn:'1h' });
  const lat = 1.2 + Math.random()*0.5, lng = 103.6 + Math.random()*0.5;

  const claim = await call('POST', `${API}/claim`, tokenA, { lat, lng, displayName: 'geo2测试' });
  const plotId = claim.body && claim.body.id;
  // 两用户在同点上报 → A 应能在附近的人里看到 B
  await call('POST', `${API}/nearby-people`, tokenB, { lat, lng, radiusM: 5000 });
  const pplA = await call('POST', `${API}/nearby-people`, tokenA, { lat, lng, radiusM: 5000 });
  const seesB = (pplA.body?.items||[]).some(p => p.userId === us[1].id);
  const poi = await call('POST', `${API}/${plotId}/poi`, tokenA, { name: '冒烟小馆', category: 'restaurant' });
  const near = await call('GET', `${API}/nearby?lat=${lat}&lng=${lng}&radiusM=2000`, tokenA);
  const found = (near.body?.items||[]).find(p => p.id === plotId);
  const chk = await call('POST', `${API}/${plotId}/checkin`, tokenA, { lat, lng });
  const board = await call('GET', `${API}/checkin/leaderboard?days=30`, tokenA);

  console.log('nearbyPeople.A_sees_B='+seesB+' count='+(pplA.body?.items||[]).length);
  console.log('poi.name='+((poi.body&&poi.body.poi&&poi.body.poi.name)||'')+' marker.poiName='+(found&&found.poiName));
  console.log('checkin.streakDays='+(chk.body&&chk.body.streakDays)+' leaderboard.count='+(board.body?.items||[]).length);

  const ok = poi.status === 201 && found && found.poiName === '冒烟小馆'
    && chk.status === 201 && typeof chk.body.streakDays === 'number' && chk.body.streakDays >= 1
    && board.status === 200 && (board.body.items||[]).length >= 1 && seesB;
  console.log(ok ? 'PASS: geo-social-2 works' : 'FAIL: geo-social-2');
  process.exit(ok?0:1);
})().catch(e=>{ console.error('ERR', e.message); process.exit(1); });
