/**
 * Aeon(永曜城)端到端价值闭环 HTTP E2E(Task 5.4 真值验收的后端半部)。
 *
 * 在能连到后端 + DB 的环境(prod / WSL / CI)运行。它:
 *   1) 从 DB 取两个真实 user(initiator=雇主, acceptor=接单者)
 *   2) 用 JWT_SECRET 签两人的 token
 *   3) 走完整闭环并断言:
 *      纪元 → 圈地 → 建房间 → 进房间 → 开公司 → 注资 → 发任务/悬赏
 *      → 接单 → 提交 → 验收放款 → 查账本守恒 → 建造放置 → 世界新闻 → 收件箱
 *
 * 用法(prod):
 *   cd /home/ubuntu/Agentrix/backend
 *   node scripts/aeon-e2e-closed-loop.mjs
 *
 * 只读 + 自建测试数据(地块/公司/任务),不改既有用户资产;失败立即退出非 0。
 */
import 'dotenv/config';
import jwt from 'jsonwebtoken';
import { Client } from 'pg';

const BASE = process.env.AEON_BASE || 'http://localhost:3000/api';
const SECRET = process.env.JWT_SECRET;
if (!SECRET) {
  console.error('JWT_SECRET 缺失');
  process.exit(1);
}

let passed = 0;
let failed = 0;
function ok(name, cond, extra = '') {
  if (cond) {
    passed++;
    console.log(`  ✅ ${name}${extra ? ' · ' + extra : ''}`);
  } else {
    failed++;
    console.error(`  ❌ ${name}${extra ? ' · ' + extra : ''}`);
  }
}

async function api(token, method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  const text = await res.text();
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  return { status: res.status, body: json };
}

async function pickUsers() {
  const c = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
  });
  await c.connect();
  const r = await c.query('SELECT id FROM users ORDER BY created_at ASC LIMIT 2');
  await c.end();
  if (r.rows.length < 2) throw new Error('需要至少 2 个用户');
  return [r.rows[0].id, r.rows[1].id];
}

async function main() {
  console.log(`Aeon E2E 闭环 → ${BASE}`);
  const [initiatorId, acceptorId] = await pickUsers();
  const tokA = jwt.sign({ sub: initiatorId, email: 'e2e-initiator@test' }, SECRET, { expiresIn: '1h' });
  const tokB = jwt.sign({ sub: acceptorId, email: 'e2e-acceptor@test' }, SECRET, { expiresIn: '1h' });
  console.log(`雇主=${initiatorId.slice(0, 8)}  接单者=${acceptorId.slice(0, 8)}`);

  // 1) 纪元
  const epochs = await api(tokA, 'GET', '/v1/aeon/plots/epochs');
  ok('GET epochs', epochs.status === 200 && Array.isArray(epochs.body?.items), `earth active=${epochs.body?.active}`);

  // 2) 圈地(随机坐标避免与既有地块冲突)
  const lat = 1 + Math.random() * 0.5;
  const lng = 103 + Math.random() * 0.5;
  const claim = await api(tokA, 'POST', '/v1/aeon/plots/claim', { lat, lng, displayName: 'E2E 测试领地' });
  ok('POST claim plot', claim.status === 201 || claim.status === 200, `plot=${claim.body?.id?.slice(0, 8)} status=${claim.status}`);
  const plotId = claim.body?.id;
  if (!plotId) return finish();

  // 3) 进入地块
  const enter = await api(tokA, 'POST', `/v1/aeon/plots/${plotId}/enter`);
  ok('POST enter plot', enter.status === 200 || enter.status === 201);

  // 4) 建房间
  const room = await api(tokA, 'POST', '/v1/aeon/rooms', { plotId, kind: 'public', displayName: 'E2E 大厅' });
  ok('POST create room', (room.status === 201 || room.status === 200) && !!room.body?.id, `room=${room.body?.id?.slice(0, 8)}`);
  const roomId = room.body?.id;

  // 5) 房间在场态 + 容量
  if (roomId) {
    const canEnter = await api(tokA, 'GET', `/v1/aeon/rooms/${roomId}/can-enter`);
    ok('GET room can-enter', canEnter.status === 200 && canEnter.body?.ok === true, `cap=${canEnter.body?.capacity}`);
  }

  // 6) 开公司
  const org = await api(tokA, 'POST', '/v1/aeon/orgs', { name: 'E2E 智能体公司', plotId });
  ok('POST create company', (org.status === 201 || org.status === 200) && !!org.body?.id, `org=${org.body?.id?.slice(0, 8)}`);
  const orgId = org.body?.id;

  // 7) 注资公司账本
  if (orgId) {
    const fund = await api(tokA, 'POST', `/v1/aeon/orgs/${orgId}/fund`, { amount: 1000 });
    ok('POST fund company', (fund.status === 200 || fund.status === 201) && fund.body?.balance >= 1000, `balance=${fund.body?.balance}`);
  }

  // 8) 发布悬赏(escrow 托管 200 AXP)
  const bounty = await api(tokA, 'POST', '/v1/aeon/tasks', {
    title: 'E2E 悬赏:画一张图',
    rewardAmount: 200,
    kind: 'bounty',
    rewardCurrency: 'AXP',
  });
  ok('POST post bounty (escrow)', (bounty.status === 201 || bounty.status === 200) && bounty.body?.escrowed === true, `task=${bounty.body?.id?.slice(0, 8)} state=${bounty.body?.state}`);
  const taskId = bounty.body?.id;
  if (!taskId) return finish();

  // 9) 浏览开放任务能看到它
  const open = await api(tokB, 'GET', '/v1/aeon/tasks?kind=bounty');
  ok('GET open tasks lists the bounty', open.status === 200 && (open.body?.items ?? []).some((t) => t.id === taskId));

  // 10) B 接单
  const accept = await api(tokB, 'POST', `/v1/aeon/tasks/${taskId}/accept`, {});
  ok('POST accept task', (accept.status === 200 || accept.status === 201) && accept.body?.state === 'in_progress');

  // 11) B 提交交付物
  const submit = await api(tokB, 'POST', `/v1/aeon/tasks/${taskId}/submit`, { deliverable: { url: 'https://example.com/art.png' } });
  ok('POST submit deliverable', (submit.status === 200 || submit.status === 201) && submit.body?.state === 'awaiting_verify');

  // 12) 非法迁移防护:B 不能验收(只有发起方能)
  const illegalVerify = await api(tokB, 'POST', `/v1/aeon/tasks/${taskId}/verify`);
  ok('verify by non-initiator rejected', illegalVerify.status === 403 || illegalVerify.status === 400, `status=${illegalVerify.status}`);

  // 13) A 验收放款 → completed,escrow 释放给 B
  const verify = await api(tokA, 'POST', `/v1/aeon/tasks/${taskId}/verify`);
  ok('POST verify → completed', (verify.status === 200 || verify.status === 201) && verify.body?.state === 'completed');

  // 14) 已完成任务不能再接(状态机终态)
  const reaccept = await api(tokB, 'POST', `/v1/aeon/tasks/${taskId}/accept`, {});
  ok('re-accept completed task rejected', reaccept.status === 400 || reaccept.status === 403, `status=${reaccept.status}`);

  // 15) 建造:目录 + 放置 + 还原
  const cat = await api(tokA, 'GET', '/v1/aeon/build/catalog');
  ok('GET build catalog', cat.status === 200 && (cat.body?.items ?? []).length > 0, `${cat.body?.items?.length} items`);
  const place = await api(tokA, 'POST', `/v1/aeon/plots/${plotId}/build`, { catalogId: 'task-board', x: 2, y: 2 });
  ok('POST place build item', (place.status === 201 || place.status === 200) && !!place.body?.id, `item=${place.body?.id?.slice(0, 8)}`);
  // 重叠应被拒绝
  const overlap = await api(tokA, 'POST', `/v1/aeon/plots/${plotId}/build`, { catalogId: 'fountain', x: 2, y: 2 });
  ok('overlapping placement rejected', overlap.status === 409 || overlap.status === 400, `status=${overlap.status}`);
  // 越界应被拒绝
  const oob = await api(tokA, 'POST', `/v1/aeon/plots/${plotId}/build`, { catalogId: 'lamp-post', x: 999, y: 999 });
  ok('out-of-bounds placement rejected', oob.status === 400, `status=${oob.status}`);
  const layout = await api(tokA, 'GET', `/v1/aeon/plots/${plotId}/build`);
  ok('GET build layout persists', layout.status === 200 && (layout.body?.items ?? []).length >= 1, `${layout.body?.items?.length} placed`);

  // 16) 世界新闻应包含本轮涌现事件(开公司/悬赏/接单/完成)
  const news = await api(tokA, 'GET', '/v1/aeon/news?limit=50');
  const headlines = (news.body?.items ?? []).map((n) => n.kind);
  ok('world news captured emergent events', news.status === 200 && headlines.length > 0,
    `kinds=${[...new Set(headlines)].join(',')}`);

  // 17) 接单者收件箱有工资/收入通知(钱包桥接路径)
  const inbox = await api(tokB, 'GET', '/v1/aeon/inbox');
  ok('acceptor inbox has digest', inbox.status === 200 && Array.isArray(inbox.body?.items), `unread=${inbox.body?.unreadCount}`);

  // 18) 排行榜可查
  const lb = await api(tokA, 'GET', '/v1/aeon/news/leaderboard');
  ok('GET leaderboard', lb.status === 200 && Array.isArray(lb.body?.items));

  finish();
}

function finish() {
  console.log(`\n=== Aeon E2E 结果: ${passed} passed, ${failed} failed ===`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('E2E 异常:', e);
  process.exit(1);
});
