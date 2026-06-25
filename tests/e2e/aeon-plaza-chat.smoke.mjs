/**
 * aeon-plaza-chat.smoke.mjs — 全服公共广场实时群聊冒烟测试。
 *
 * 验证社交场所 Step 1:两个客户端加入同一虚拟广场房间(aeon-public-plaza),
 * B 发 {t:'chat',scope:'room'},A 应实时收到 {t:'chat',fromCharId:'charB',text}。
 * 这是公共广场 UI 依赖的后端能力(网关 handleClientEvent case 'chat' 已实现)。
 *
 * 用法(后端机器,backend 目录,需 socket.io-client):
 *   node tests/e2e/aeon-plaza-chat.smoke.mjs <wsBase> <jwtA> <jwtB>
 *   例: node tests/e2e/aeon-plaza-chat.smoke.mjs http://localhost:3000 $TOKEN_A $TOKEN_B
 *
 * 退出码 0 = 通过(A 收到 B 的聊天);1 = 失败。
 */
import { io as ioClient } from 'socket.io-client';

const WS = process.argv[2] || 'http://localhost:3000';
const TOKEN_A = process.argv[3];
const TOKEN_B = process.argv[4];
if (!TOKEN_A || !TOKEN_B) {
  console.error('usage: node aeon-plaza-chat.smoke.mjs <wsBase> <jwtA> <jwtB>');
  process.exit(2);
}

// 用与移动端相同的固定广场房间 id,顺带验证该 roomId 可被网关接受。
const ROOM = 'aeon-public-plaza';
const MSG = `hello-plaza-${Date.now()}`;
const snap = (cid, nm) => ({
  charId: cid, ownerUserId: 'x', controlState: 'manual', isAgentDriven: false,
  badge: 'human', clan: 'A', x: 3, y: 3, facing: 'right', sprite: 'idle', displayName: nm,
});

const a = ioClient(`${WS}/aeon`, { transports: ['websocket'], auth: { token: TOKEN_A }, forceNew: true });
const b = ioClient(`${WS}/aeon`, { transports: ['websocket'], auth: { token: TOKEN_B }, forceNew: true });

let passed = false;
function finish(ok) {
  console.log(ok ? 'PASS: plaza realtime group chat works' : 'FAIL: A did not receive B chat');
  try { a.close(); b.close(); } catch {}
  process.exit(ok ? 0 : 1);
}

a.on('connect', () => a.emit('aeon:join', { roomId: ROOM, charId: 'charA', snapshot: snap('charA', 'A') }));
b.on('connect', () =>
  setTimeout(() => {
    b.emit('aeon:join', { roomId: ROOM, charId: 'charB', snapshot: snap('charB', 'B') });
    // 入场后稍候发一条群聊
    setTimeout(() => b.emit('aeon:client', { t: 'chat', text: MSG, scope: 'room' }), 600);
  }, 600),
);

a.on('aeon:server', (ev) => {
  if (ev && ev.t === 'chat' && ev.text === MSG) {
    passed = true;
    finish(true);
  }
});
a.on('connect_error', (e) => console.error('A connect_error', e.message));
b.on('connect_error', (e) => console.error('B connect_error', e.message));
setTimeout(() => finish(passed), 9000);
