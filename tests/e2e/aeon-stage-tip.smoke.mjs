/**
 * aeon-stage-tip.smoke.mjs — 直播厅舞台全流程冒烟(host/举手/上台/打赏 + AXP 真实流转)。
 *
 * 验证 Stage 原语(社交场所 Step 2)端到端:
 *   A 进 host(首进自动 host)→ B 进 audience → B 举手 → A 收到 hand_raised →
 *   A invite B → B 变 speaker(char_upsert.stageRole=speaker)→ B 给 A 打赏 50 AXP →
 *   双方收到 stage_tip 广播(amount=50, totalToTarget=50)。
 * 余额/账本断言另由 stage-verify-ledger 脚本完成(spend from B / earn to A)。
 *
 * 用法(后端机 backend 目录,需两个真实用户 JWT;打赏者需 ≥50 AXP):
 *   node tests/e2e/aeon-stage-tip.smoke.mjs <wsBase> <tokenA> <tokenB> <charA> <charB>
 * 2026-06-02 首次跑通(prod):balA 0→50,balB 1575→1525,ledger earn/spend aeon_stage_tip 各一条。
 *
 * 退出码 0 = PASS;1 = FAIL。
 */
import { io } from 'socket.io-client';

const [, , WS, TOKEN_A, TOKEN_B, CHAR_A, CHAR_B] = process.argv;
if (!TOKEN_A || !TOKEN_B || !CHAR_A || !CHAR_B) {
  console.error('usage: node aeon-stage-tip.smoke.mjs <wsBase> <tokenA> <tokenB> <charA> <charB>');
  process.exit(2);
}
const ROOM = 'aeon-live-main';
const snap = (cid, nm, role) => ({
  charId: cid, ownerUserId: 'x', controlState: 'manual', isAgentDriven: false,
  badge: 'human', clan: 'A', x: 3, y: 3, facing: 'right', sprite: 'idle', displayName: nm, stageRole: role,
});

const a = io(`${WS}/aeon`, { transports: ['websocket'], auth: { token: TOKEN_A }, forceNew: true });
const b = io(`${WS}/aeon`, { transports: ['websocket'], auth: { token: TOKEN_B }, forceNew: true });

const r = { handRaised: false, bBecameSpeaker: false, tipBroadcast: false, tipAmount: 0, tipTotal: 0, tipFailed: null };
function done() {
  const ok = r.handRaised && r.bBecameSpeaker && r.tipBroadcast && r.tipAmount === 50 && r.tipTotal === 50 && !r.tipFailed;
  console.log('RESULT ' + JSON.stringify(r));
  console.log(ok ? 'PASS: stage host/handraise/invite/tip works' : 'FAIL: stage flow incomplete');
  try { a.close(); b.close(); } catch {}
  process.exit(ok ? 0 : 1);
}

a.on('connect', () => a.emit('aeon:join', { roomId: ROOM, charId: CHAR_A, snapshot: snap(CHAR_A, 'HostA', 'audience') }));
a.on('aeon:server', (ev) => {
  if (ev.t === 'stage_hand_raised' && ev.fromCharId === CHAR_B) {
    r.handRaised = true;
    a.emit('aeon:client', { t: 'stage_invite', targetCharId: CHAR_B });
  }
  if (ev.t === 'stage_tip' && ev.targetCharId === CHAR_A) {
    r.tipBroadcast = true; r.tipAmount = ev.amount; r.tipTotal = ev.totalToTarget;
    setTimeout(done, 300);
  }
});
b.on('connect', () => setTimeout(() => b.emit('aeon:join', { roomId: ROOM, charId: CHAR_B, snapshot: snap(CHAR_B, 'AudienceB', 'audience') }), 700));
b.on('aeon:server', (ev) => {
  if (ev.t === 'room_state') setTimeout(() => b.emit('aeon:client', { t: 'stage_raise_hand' }), 300);
  if (ev.t === 'char_upsert' && ev.char.charId === CHAR_B && ev.char.stageRole === 'speaker') {
    r.bBecameSpeaker = true;
    setTimeout(() => b.emit('aeon:client', { t: 'stage_tip', targetCharId: CHAR_A, amount: 50 }), 300);
  }
  if (ev.t === 'action' && typeof ev.action === 'string' && ev.action.startsWith('tip_failed:')) r.tipFailed = ev.action;
});
a.on('connect_error', (e) => console.error('A err', e.message));
b.on('connect_error', (e) => console.error('B err', e.message));
setTimeout(done, 12000);
