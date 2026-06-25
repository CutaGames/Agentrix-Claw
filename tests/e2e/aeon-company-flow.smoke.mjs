/**
 * aeon-company-flow.smoke.mjs — 公司运营全流程冒烟(开公司→注资→雇agent→打卡→结算)。
 *
 * 自包含:读 backend/.env JWT_SECRET 签 token + 直接打 REST。需要被测用户有一块自己的地块
 * (没有则先 claim 一块)。验证用户报告的"注资/雇佣跑不通"。
 *
 * 用法(后端机 backend 目录):node tests/e2e/aeon-company-flow.smoke.mjs
 * 退出码 0=PASS。
 */
import http from 'node:http';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire('/home/ubuntu/Agentrix/backend/');
const { Client } = require('pg');
const jwt = require('jsonwebtoken');

const API = 'http://localhost:3000/api/v1/aeon';
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
  const g = (k) => (env.split('\n').find((l) => l.startsWith(k + '=')) || '').replace(k + '=', '').trim();
  const c = new Client({ host: g('DB_HOST') || 'localhost', port: Number(g('DB_PORT') || 5432), user: g('DB_USERNAME'), password: g('DB_PASSWORD'), database: g('DB_DATABASE') || 'paymind' });
  await c.connect();
  const u = (await c.query('SELECT id FROM users ORDER BY created_at ASC LIMIT 1')).rows[0];
  await c.end();
  const token = jwt.sign({ sub: u.id, id: u.id, userId: u.id }, g('JWT_SECRET'), { expiresIn: '1h' });

  // 0) 确保有地块
  let plots = (await call('GET', `${API}/plots/mine`, token)).body.items;
  if (!plots || plots.length === 0) {
    const claim = await call('POST', `${API}/plots/claim`, token, { lat: 1.30 + Math.random() * 0.01, lng: 103.85 + Math.random() * 0.01, displayName: '冒烟测试地' });
    console.log('claim.status=' + claim.status);
    plots = (await call('GET', `${API}/plots/mine`, token)).body.items;
  }
  const plotId = plots[0].id;

  // 1) 开公司
  const co = await call('POST', `${API}/orgs`, token, { name: '冒烟测试公司', plotId });
  console.log('create.status=' + co.status + ' orgId=' + (co.body && co.body.id));
  const orgId = co.body && co.body.id;
  if (!orgId) { console.log('FAIL create', JSON.stringify(co.body)); process.exit(1); }

  // 2) 注资 200
  const fund = await call('POST', `${API}/orgs/${orgId}/fund`, token, { amount: 200 });
  console.log('fund.status=' + fund.status + ' balance=' + (fund.body && fund.body.balance));

  // 3) 雇 agent(memberUserId 传空串,复现移动端历史 bug;修复后应回退当前用户)
  const fakeInstanceId = u.id; // 用 userId 当占位 instance id(uuid 合法)
  const hire = await call('POST', `${API}/orgs/${orgId}/employees`, token, { memberUserId: '', agentInstanceId: fakeInstanceId, wageAxpPerPeriod: 20 });
  console.log('hire.status=' + hire.status + ' memberId=' + (hire.body && hire.body.id) + ' memberUserId=' + (hire.body && hire.body.memberUserId));
  const memberId = hire.body && hire.body.id;

  // 4) 成员名册
  const members = await call('GET', `${API}/orgs/${orgId}/members`, token);
  console.log('members.count=' + (members.body && members.body.items.length));

  // 5) 打卡
  let clockOk = null;
  if (memberId) {
    const ci = await call('POST', `${API}/orgs/${orgId}/members/${memberId}/clock-in`, token);
    clockOk = ci.status + '/' + (ci.body && ci.body.ok);
    console.log('clockIn.status=' + ci.status + ' ok=' + (ci.body && ci.body.ok));
    // 6) 结算(无 KPI 任务时 paid=0,但不应报错)
    const st = await call('POST', `${API}/orgs/${orgId}/members/${memberId}/settle`, token);
    console.log('settle.status=' + st.status + ' paid=' + (st.body && st.body.paid) + ' output=' + JSON.stringify(st.body && st.body.output));
  }

  const ok = co.status === 201 && fund.status === 201 && fund.body.balance === 200 && hire.status === 201 && !!memberId && hire.body.memberUserId === u.id;
  console.log(ok ? 'PASS: company flow works (fund+hire fixed)' : 'FAIL: company flow');
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error('ERR', e.message); process.exit(1); });
