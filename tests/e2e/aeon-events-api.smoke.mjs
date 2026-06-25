/**
 * aeon-events-api.smoke.mjs — 活动 API 端到端冒烟(社交场所 Step 3)。
 *
 * 自包含:读 backend/.env 的 JWT_SECRET 签两个真实用户 token,跑活动全流程:
 *   A 创建立即开场活动 → status=live + roomId=aeon-live-<id> → 列表查到 →
 *   B 预约(rsvped=true,count=1)→ B 详情 rsvpedByMe=true → A 取消(清理)。
 * 2026-06-02 首次跑通(prod)。
 *
 * 用法(后端机 backend 目录):node tests/e2e/aeon-events-api.smoke.mjs
 * 退出码 0=PASS,1=FAIL。
 */
import http from 'node:http';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire('/home/ubuntu/Agentrix/backend/');
const { Client } = require('pg');
const jwt = require('jsonwebtoken');

const BASE = 'http://localhost:3000/api/v1/aeon/events';
function req(method, path, token, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const u = new URL(path);
    const r = http.request(
      { hostname: u.hostname, port: u.port, path: u.pathname + u.search, method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}) } },
      (res) => { let b = ''; res.on('data', (c) => (b += c)); res.on('end', () => resolve({ status: res.statusCode, body: b ? JSON.parse(b) : null })); },
    );
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

(async () => {
  const env = fs.readFileSync('/home/ubuntu/Agentrix/backend/.env', 'utf8');
  const g = (k) => (env.split('\n').find((l) => l.startsWith(k + '=')) || '').replace(k + '=', '').trim();
  const secret = g('JWT_SECRET');
  const c = new Client({ host: g('DB_HOST') || 'localhost', port: Number(g('DB_PORT') || 5432), user: g('DB_USERNAME'), password: g('DB_PASSWORD'), database: g('DB_DATABASE') || 'paymind' });
  await c.connect();
  const us = (await c.query('SELECT id FROM users ORDER BY created_at ASC LIMIT 2')).rows;
  await c.end();
  const mk = (sub) => jwt.sign({ sub, id: sub, userId: sub }, secret, { expiresIn: '1h' });
  const A = mk(us[0].id), B = mk(us[1].id);

  const create = await req('POST', BASE, A, { title: '测试脱口秀-冒烟', kind: 'talk_show', startsAt: Date.now() });
  const id = create.body && create.body.id;
  if (!id) { console.log('FAIL: create', create.status, JSON.stringify(create.body)); process.exit(1); }
  const list = await req('GET', BASE, A);
  const found = list.body.items.find((e) => e.id === id);
  const rsvp = await req('POST', `${BASE}/${id}/rsvp`, B);
  const detail = await req('GET', `${BASE}/${id}`, B);
  const ok = create.status === 201 && create.body.status === 'live' && create.body.roomId === `aeon-live-${id}` && !!found && rsvp.body.rsvped === true && detail.body.rsvpedByMe === true && detail.body.rsvpCount === 1;
  console.log(`create=${create.status}/${create.body.status} found=${!!found} rsvp=${rsvp.body.rsvped} byMe=${detail.body.rsvpedByMe}/${detail.body.rsvpCount}`);
  console.log(ok ? 'PASS: events api works' : 'FAIL: events api');
  await req('POST', `${BASE}/${id}/cancel`, A);
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
