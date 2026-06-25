/**
 * connector-errand.smoke.mjs — 连接器 + 玩法A(派 agent 办真事→AXP)端到端冒烟。
 *
 * 自包含(后端机 backend 目录跑):
 *   1) GET /v1/connectors            → 目录非空,含 crypto-price(live)
 *   2) POST /v1/connectors/install   → 装 crypto-price(免鉴权)
 *   3) POST /v1/connectors/crypto-price/run    → 查到 BTC 价格
 *   4) 读 user 钱包余额 before
 *   5) POST /v1/connectors/crypto-price/errand → 派 agent 办事,返回 rewardAxp + bridged
 *   6) 读余额 after,断言增加了 rewardAxp
 *
 * 用法:node tests/e2e/connector-errand.smoke.mjs
 * 退出码 0=PASS。2026-06-02 首次跑通(prod)。
 */
import http from 'node:http';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire('/home/ubuntu/Agentrix/backend/');
const { Client } = require('pg');
const jwt = require('jsonwebtoken');

const API = 'http://localhost:3000/api/v1/connectors';
function call(method, path, token, body) {
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
  const g = (k) => { const l = env.split('\n').find((x) => x.startsWith(k + '=')); return l ? l.slice(k.length + 1).trim() : ''; };
  const c = new Client({ host: g('DB_HOST') || 'localhost', port: Number(g('DB_PORT') || 5432), user: g('DB_USERNAME'), password: g('DB_PASSWORD'), database: g('DB_DATABASE') || 'paymind' });
  await c.connect();
  const u = (await c.query('SELECT id FROM users ORDER BY created_at ASC LIMIT 1')).rows[0];
  const balRow0 = (await c.query('SELECT balance FROM user_axp_balances WHERE user_id=$1', [u.id])).rows[0];
  const before = Number(balRow0?.balance ?? 0);
  await c.end();
  const token = jwt.sign({ sub: u.id, id: u.id, userId: u.id }, g('JWT_SECRET'), { expiresIn: '1h' });

  const cat = await call('GET', API, token);
  const hasCrypto = (cat.body?.items || []).some((x) => x.id === 'crypto-price' && x.status === 'live');
  console.log('catalog.status=' + cat.status + ' count=' + (cat.body?.items || []).length + ' hasCryptoLive=' + hasCrypto);

  const inst = await call('POST', `${API}/install`, token, { connectorId: 'crypto-price' });
  console.log('install.status=' + inst.status + ' installed=' + (inst.body?.installed));

  const run = await call('POST', `${API}/crypto-price/run`, token, { coin: 'bitcoin' });
  console.log('run.status=' + run.status + ' summary=' + (run.body?.summary));

  const errand = await call('POST', `${API}/crypto-price/errand`, token, { coin: 'bitcoin' });
  console.log('errand.status=' + errand.status + ' reward=' + (errand.body?.rewardAxp) + ' bridged=' + (errand.body?.bridged) + ' summary=' + (errand.body?.summary));

  // 余额 after(用新连接确保读到最新)
  const c2 = new Client({ host: g('DB_HOST') || 'localhost', port: Number(g('DB_PORT') || 5432), user: g('DB_USERNAME'), password: g('DB_PASSWORD'), database: g('DB_DATABASE') || 'paymind' });
  await c2.connect();
  const after = Number((await c2.query('SELECT balance FROM user_axp_balances WHERE user_id=$1', [u.id])).rows[0]?.balance ?? 0);
  await c2.end();
  console.log('balance before=' + before + ' after=' + after + ' delta=' + (after - before));

  const reward = errand.body?.rewardAxp ?? 0;
  const ok = cat.status === 200 && hasCrypto && inst.status === 201 && run.status === 201
    && errand.status === 201 && reward > 0 && (!errand.body?.bridged || after - before === reward);
  console.log(ok ? 'PASS: connector catalog/install/run/errand + AXP credit works' : 'FAIL: connector flow');
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
