/**
 * aeon-realtime-presence.smoke.mjs — Aeon /aeon 实时同步多人在场冒烟测试。
 *
 * 验证 design.md "实时同步层":两个客户端加入同一房间,A 应实时收到 B 的 char_upsert。
 * 这是 Phase 0 一直缺的多人实测(之前只建了网关,没验过 2-user 同框)。2026-06-01 首次跑通。
 *
 * 用法(在后端机器上,backend 目录,需 JWT_SECRET 环境 + socket.io-client):
 *   node tests/e2e/aeon-realtime-presence.smoke.mjs <wsBase> <jwtA> <jwtB>
 *   例: node tests/e2e/aeon-realtime-presence.smoke.mjs http://localhost:3000 $TOKEN_A $TOKEN_B
 *
 * 退出码 0 = 通过(A 收到 B);1 = 失败。
 */
import { io as ioClient } from 'socket.io-client';

const WS = process.argv[2] || 'http://localhost:3000';
const TOKEN_A = process.argv[3];
const TOKEN_B = process.argv[4];
if (!TOKEN_A || !TOKEN_B) {
  console.error('usage: node aeon-realtime-presence.smoke.mjs <wsBase> <jwtA> <jwtB>');
  process.exit(2);
}

const ROOM = `rt-smoke-${Date.now()}`;
const snap = (cid, nm) => ({
  charId: cid, ownerUserId: 'x', controlState: 'manual', isAgentDriven: false,
  badge: 'human', clan: 'A', x: 5, y: 5, facing: 'right', sprite: 'idle', displayName: nm,
});

const a = ioClient(`${WS}/aeon`, { transports: ['websocket'], auth: { token: TOKEN_A }, forceNew: true });
const b = ioClient(`${WS}/aeon`, { transports: ['websocket'], auth: { token: TOKEN_B }, forceNew: true });

let passed = false;
function finish(ok) {
  console.log(ok ? 'PASS: realtime multi-user presence works' : 'FAIL: A did not receive B');
  try { a.close(); b.close(); } catch {}
  process.exit(ok ? 0 : 1);
}
a.on('connect', () => a.emit('aeon:join', { roomId: ROOM, charId: 'charA', snapshot: snap('charA', 'A') }));
b.on('connect', () => setTimeout(() => b.emit('aeon:join', { roomId: ROOM, charId: 'charB', snapshot: snap('charB', 'B') }), 600));
a.on('aeon:server', (ev) => { if (JSON.stringify(ev).includes('charB')) { passed = true; finish(true); } });
a.on('connect_error', (e) => console.error('A connect_error', e.message));
b.on('connect_error', (e) => console.error('B connect_error', e.message));
setTimeout(() => finish(passed), 8000);
