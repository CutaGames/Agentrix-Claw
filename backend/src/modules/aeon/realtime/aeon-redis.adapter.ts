import { INestApplicationContext, Logger } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import type { ServerOptions, Server } from 'socket.io';

/**
 * AeonRedisIoAdapter — Socket.IO 多实例 fan-out 适配器(Task 0.3)。
 *
 * 背景(design.md 复用表):当前代码库**没有** Redis adapter,跨进程 fan-out 靠
 * in-process EventEmitter。多后端实例下,同一 `aeon:room:<id>` 的用户若连到不同
 * 实例,彼此收不到广播。本适配器在配置了 `REDIS_URL` 时挂载 `@socket.io/redis-adapter`,
 * 否则降级为单实例模式(spike 可先单实例验证延迟,再开多实例验证 fan-out)。
 *
 * 依赖 `ioredis` + `@socket.io/redis-adapter`(当前未安装)。采用 **lazy require**:
 * 未安装或未配置 REDIS_URL 时不报错,网关仍以单实例工作(优雅降级)。
 *
 * 启用方式(在 backend/src/main.ts bootstrap 内,创建 app 后、listen 前):
 *   const { AeonRedisIoAdapter } = await import('./modules/aeon/realtime/aeon-redis.adapter');
 *   const adapter = new AeonRedisIoAdapter(app);
 *   await adapter.connectToRedis();          // REDIS_URL 缺失则 no-op
 *   app.useWebSocketAdapter(adapter);
 *
 * 注意:useWebSocketAdapter 是全局的,会影响所有 socket.io 网关(/ws /presence /aeon ...)。
 * 这正是我们想要的——现有网关也能借此获得多实例能力。spike 阶段如只想隔离验证 /aeon,
 * 可在单实例下跑(不调用 connectToRedis)。
 */
export class AeonRedisIoAdapter extends IoAdapter {
  private readonly logger = new Logger(AeonRedisIoAdapter.name);
  private adapterConstructor: ((nsp: unknown) => unknown) | null = null;

  constructor(private readonly app: INestApplicationContext) {
    super(app);
  }

  /**
   * 连接 Redis 并构建 socket.io adapter。REDIS_URL 缺失 → no-op(单实例)。
   * 包/连接失败 → 记录并降级,不抛出(不让实时层缺失拖垮整个后端启动)。
   */
  async connectToRedis(): Promise<void> {
    const url = process.env.REDIS_URL;
    if (!url) {
      this.logger.warn('REDIS_URL 未配置 — Aeon 实时层以单实例模式运行(无多实例 fan-out)');
      return;
    }
    try {
      // lazy require:避免未安装依赖时 import 期即崩。
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const IORedis = require('ioredis');
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { createAdapter } = require('@socket.io/redis-adapter');
      const pubClient = new IORedis(url);
      const subClient = pubClient.duplicate();
      this.adapterConstructor = createAdapter(pubClient, subClient);
      this.logger.log('Aeon 实时层已挂载 Redis adapter(多实例 fan-out 就绪)');
    } catch (err: any) {
      this.logger.error(
        `Redis adapter 挂载失败,降级为单实例:${err?.message}. ` +
          `(需安装 ioredis + @socket.io/redis-adapter 并设置 REDIS_URL)`,
      );
      this.adapterConstructor = null;
    }
  }

  createIOServer(port: number, options?: ServerOptions): Server {
    const server: Server = super.createIOServer(port, options);
    if (this.adapterConstructor) {
      server.adapter(this.adapterConstructor as never);
    }
    return server;
  }
}
