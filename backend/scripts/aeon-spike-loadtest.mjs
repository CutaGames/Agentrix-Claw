/**
 * Aeon 实时同步 spike 压测脚本(Task 0.5)。
 *
 * 目标(R1.2):模拟 N=20 并发参与者占用一个房间,持续 60s 互发位置更新,
 * 测量 p95 端到端延迟、每参与者带宽,并对 20/100 并发给出成本投影输入。
 *
 * 用法(在能连到后端的环境,如 WSL / CI):
 *   AEON_WS=https://api.agentrix.top \
 *   AEON_TOKEN_FILE=./tokens.json \   # JSON 数组,每个参与者一个 JWT
 *   AEON_ROOM=spike-room-1 \
 *   AEON_N=20 AEON_DURATION_S=60 AEON_HZ=10 \
 *   node backend/scripts/aeon-spike-loadtest.mjs
 *
 * 说明:
 *   - 端到端延迟测量法:每个参与者在 move 事件里携带本地发出时间戳(piggyback 到
 *     action 的 echo),其它参与者收到 char_upsert 后用 (收到时刻 - 发出时刻) 计延迟。
 *     由于 char_upsert 不回传客户端时间,这里改用"自发自收回环"近似:参与者发
 *     {t:'action', action:'ping:<ts>'},服务器广播给同房其它人,接收方立即回
 *     {t:'action', action:'pong:<ts>'},原发送方据 pong 算 RTT/2 ≈ 单程延迟。
 *   - 需要 socket.io-client(后端已有 socket.io 依赖;若缺 client 包,在该环境
 *     `npm i -D socket.io-client` 后运行)。
 */
import { io } from 'socket.io-client';
import { readFileSync } from 'node:fs';

const WS = process.env.AEON_WS || 'http://localhost:3001';
const NAMESPACE = '/aeon';
const ROOM = process.env.AEON_ROOM || 'spike-room-1';
const N = parseInt(process.env.AEON_N || '20', 10);
const DURATION_S = parseInt(process.env.AEON_DURATION_S || '60', 10);
const HZ = parseInt(process.env.AEON_HZ || '10', 10);
const TOKEN_FILE = process.env.AEON_TOKEN_FILE;

const CLIENT_EVENT = 'aeon:client';
const SERVER_EVENT = 'aeon:server';
const JOIN = 'aeon:join';

function loadTokens() {
  if (!TOKEN_FILE) {
    console.error('AEON_TOKEN_FILE 未设置:需提供 JSON 数组(每参与者一个 JWT)');
    process.exit(1);
  }
  const arr = JSON.parse(readFileSync(TOKEN_FILE, 'utf8'));
  if (!Array.isArray(arr) || arr.length < N) {
    console.error(`token 文件需至少 ${N} 个 JWT,当前 ${arr?.length}`);
    process.exit(1);
  }
  return arr.slice(0, N);
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

async function main() {
  const tokens = loadTokens();
  const latencies = []; // 单程延迟样本(ms)
  let bytesUp = 0;
  let bytesDown = 0;
  const sockets = [];

  console.log(`连接 ${N} 个参与者到 ${WS}${NAMESPACE} 房间=${ROOM} ...`);

  await Promise.all(
    tokens.map(
      (token, i) =>
        new Promise((resolve) => {
          const s = io(`${WS}${NAMESPACE}`, {
            transports: ['websocket'],
            auth: { token },
            forceNew: true,
          });
          const charId = `spike-char-${i}`;
          s.on('connect', () => {
            s.emit(JOIN, {
              roomId: ROOM,
              charId,
              snapshot: {
                charId,
                ownerUserId: `spike-user-${i}`,
                controlState: 'manual',
                isAgentDriven: false,
                badge: 'human',
                clan: 'A',
                x: Math.floor(Math.random() * 20),
                y: Math.floor(Math.random() * 20),
                facing: 'right',
                sprite: 'idle',
                displayName: `Spike${i}`,
              },
            });
            resolve();
          });
          s.on(SERVER_EVENT, (ev) => {
            bytesDown += JSON.stringify(ev).length;
            // 回环延迟测量
            if (ev.t === 'action' && typeof ev.action === 'string') {
              if (ev.action.startsWith('ping:') && ev.fromCharId !== charId) {
                // 收到他人 ping → 立即 pong(带原 ts)
                const ts = ev.action.slice(5);
                const msg = { t: 'action', action: `pong:${ts}:${charId}` };
                bytesUp += JSON.stringify(msg).length;
                s.emit(CLIENT_EVENT, msg);
              } else if (ev.action.startsWith('pong:')) {
                const [, ts, responder] = ev.action.split(':');
                // 只统计回给"我自己 ping"的 pong:这里简化为任意 pong 都算一次 RTT 样本
                const sentAt = Number(ts);
                if (Number.isFinite(sentAt)) {
                  const rtt = Date.now() - sentAt;
                  latencies.push(rtt / 2); // RTT/2 ≈ 单程
                }
              }
            }
          });
          sockets.push({ s, charId });
        }),
    ),
  );

  console.log(`全部连接完成,开始 ${DURATION_S}s 负载(每参与者 ${HZ}Hz)...`);
  const intervalMs = Math.floor(1000 / HZ);
  const endAt = Date.now() + DURATION_S * 1000;

  const timers = sockets.map(({ s, charId }) =>
    setInterval(() => {
      if (Date.now() > endAt) return;
      // 位置移动
      const move = {
        t: 'move',
        x: Math.floor(Math.random() * 20),
        y: Math.floor(Math.random() * 20),
        facing: Math.random() > 0.5 ? 'right' : 'left',
      };
      bytesUp += JSON.stringify(move).length;
      s.emit(CLIENT_EVENT, move);
      // 周期性 ping 测延迟(约每秒一次)
      if (Math.random() < 1 / HZ) {
        const ping = { t: 'action', action: `ping:${Date.now()}` };
        bytesUp += JSON.stringify(ping).length;
        s.emit(CLIENT_EVENT, ping);
      }
    }, intervalMs),
  );

  await new Promise((r) => setTimeout(r, DURATION_S * 1000));
  timers.forEach(clearInterval);
  sockets.forEach(({ s }) => s.close());

  latencies.sort((a, b) => a - b);
  const p50 = percentile(latencies, 50);
  const p95 = percentile(latencies, 95);
  const p99 = percentile(latencies, 99);
  const perParticipantBw = ((bytesUp + bytesDown) / N / DURATION_S).toFixed(0);

  console.log('\n=== Aeon Spike 结果 ===');
  console.log(`参与者: ${N}  时长: ${DURATION_S}s  频率: ${HZ}Hz`);
  console.log(`延迟样本: ${latencies.length}`);
  console.log(`单程延迟 p50=${p50.toFixed(1)}ms  p95=${p95.toFixed(1)}ms  p99=${p99.toFixed(1)}ms`);
  console.log(`目标: p95 ≤ ${300}ms → ${p95 <= 300 ? 'PASS ✅' : 'FAIL ❌'}`);
  console.log(`带宽: 上行 ${(bytesUp / 1024).toFixed(0)}KB 下行 ${(bytesDown / 1024).toFixed(0)}KB`);
  console.log(`每参与者均带宽 ≈ ${perParticipantBw} B/s`);
  console.log(`成本投影输入: 20 并发 ≈ ${perParticipantBw * 20} B/s;100 并发 ≈ ${perParticipantBw * 100} B/s`);
  process.exit(p95 <= 300 ? 0 : 1);
}

main().catch((e) => {
  console.error('spike 失败:', e);
  process.exit(1);
});
