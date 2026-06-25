import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as tls from 'tls';
import axios from 'axios';
import { UserConnector } from './user-connector.entity';
import { ConnectorOAuthService } from './connector-oauth.service';
import type { CalendarEmailReadout } from '../../../../shared/types/connector';

/**
 * CalendarEmailReadout — 「办成第一件真事」的数据读取(R4.3/R6.5,设计 §5.4)。
 *
 * `todaySummary(userId, connectorId)` 按连接器分流,返回当天日程数 / 未读邮件数:
 *   - google-calendar → Calendar API events.list(今日 0 点 ~ 次日 0 点)→ 计数
 *   - gmail           → Gmail API users.messages.list(q='is:unread')→ resultSizeEstimate
 *   - imap-email      → IMAP(TLS)LOGIN → SELECT INBOX → SEARCH UNSEEN → 计数
 *   - system-calendar → 由移动端本地读取后回传 count(端侧,见 ReadoutOptions.clientCount)
 *
 * 安全(R6.8):
 *   - Google 访问令牌经 ConnectorOAuthService.getValidAccessToken 取得(临期自动刷新),
 *     本服务不接触明文令牌存储,也绝不把令牌、邮件正文/主题、日程标题写入日志;
 *     日志只记 connectorId + userId + 计数。
 *   - 只读 scope:Google 连接器在授权阶段即限定 calendar.readonly / gmail.readonly(见
 *     ConnectorOAuthService),本服务仅发只读读取请求,不做任何写操作。
 *
 * IMAP 依赖说明:仓库未安装任何 IMAP 库(node-imap / imapflow 等),为避免引入未安装的硬依赖,
 * 本服务用 Node 内置 `tls` 实现一个最小 IMAP-over-TLS 客户端(仅 LOGIN/SELECT/SEARCH/LOGOUT),
 * 只支持隐式 TLS(默认 993 端口)。STARTTLS(143)与更复杂的 IMAP 能力为后续增强。
 */

/** 读取结果(设计 §5.4 签名)。kind 区分日历/邮箱,count 为今日日程数或未读数。 */
// 规范定义已收敛到 shared/types/connector.ts(≥2 端共用);此处重导出保持既有引用不变。
export type { CalendarEmailReadout };

/** todaySummary 的可选入参。 */
export interface ReadoutOptions {
  /** system-calendar:端侧(移动端本地日历)读取后回传的今日日程数。 */
  clientCount?: number;
  /** system-calendar:端侧回传的日程标题(可选,用于 TTS 念出)。 */
  clientItems?: string[];
  /**
   * 计算「今日」边界用的时区偏移(UTC 以东分钟数,如北京/新加坡为 +480)。
   * 缺省用服务器本地时区。仅 google-calendar 用到。
   */
  tzOffsetMinutes?: number;
}

const CALENDAR_EVENTS_ENDPOINT =
  'https://www.googleapis.com/calendar/v3/calendars/primary/events';
const GMAIL_MESSAGES_ENDPOINT =
  'https://gmail.googleapis.com/gmail/v1/users/me/messages';
const HTTP_TIMEOUT_MS = 15000;
const IMAP_TIMEOUT_MS = 15000;
const IMAP_DEFAULT_PORT = 993;

@Injectable()
export class CalendarEmailReadoutService {
  private readonly logger = new Logger(CalendarEmailReadoutService.name);

  constructor(
    @InjectRepository(UserConnector)
    private readonly connectorRepo: Repository<UserConnector>,
    private readonly oauth: ConnectorOAuthService,
  ) {}

  /**
   * 读取某连接器的当天概览(日程数 / 未读数)。
   * 失败时抛描述性错误,绝不在日志中记录令牌 / 邮件内容 / 日程标题(R6.8)。
   */
  async todaySummary(
    userId: string,
    connectorId: string,
    options: ReadoutOptions = {},
  ): Promise<CalendarEmailReadout> {
    switch (connectorId) {
      case 'google-calendar':
        return this.googleCalendarToday(userId, options);
      case 'gmail':
        return this.gmailUnread(userId);
      case 'imap-email':
        return this.imapUnread(userId);
      case 'system-calendar':
        return this.systemCalendar(options);
      default:
        throw new BadRequestException(`连接器「${connectorId}」不支持日程/未读读取`);
    }
  }

  // ── google-calendar:今日日程计数 ────────────────────────────────

  private async googleCalendarToday(
    userId: string,
    options: ReadoutOptions,
  ): Promise<CalendarEmailReadout> {
    const accessToken = await this.oauth.getValidAccessToken(userId, 'google-calendar');
    const { timeMin, timeMax } = this.todayBounds(options.tzOffsetMinutes);

    let resp;
    try {
      resp = await axios.get(CALENDAR_EVENTS_ENDPOINT, {
        params: {
          timeMin,
          timeMax,
          singleEvents: true, // 展开重复事件,计数更贴近真实「今日安排」
          orderBy: 'startTime',
          maxResults: 50,
        },
        headers: { Authorization: `Bearer ${accessToken}` },
        timeout: HTTP_TIMEOUT_MS,
      });
    } catch {
      // 不记录任何响应体 / 令牌(R6.8)。
      this.logger.warn(`calendar readout failed connector=google-calendar user=${userId}`);
      throw new BadRequestException('读取 Google 日历失败,请重试或改用兜底连接器');
    }

    const events: any[] = Array.isArray(resp.data?.items) ? resp.data.items : [];
    const items = events
      .map((e) => (typeof e?.summary === 'string' ? e.summary : ''))
      .filter((s) => s.length > 0);
    const count = events.length;

    this.logger.log(`calendar readout connector=google-calendar user=${userId} count=${count}`);
    return { kind: 'calendar', count, items: items.length ? items : undefined };
  }

  // ── gmail:未读计数 ─────────────────────────────────────────────

  private async gmailUnread(userId: string): Promise<CalendarEmailReadout> {
    const accessToken = await this.oauth.getValidAccessToken(userId, 'gmail');

    let resp;
    try {
      resp = await axios.get(GMAIL_MESSAGES_ENDPOINT, {
        params: { q: 'is:unread', maxResults: 1 },
        headers: { Authorization: `Bearer ${accessToken}` },
        timeout: HTTP_TIMEOUT_MS,
      });
    } catch {
      this.logger.warn(`email readout failed connector=gmail user=${userId}`);
      throw new BadRequestException('读取 Gmail 未读失败,请重试或改用兜底连接器');
    }

    const count =
      typeof resp.data?.resultSizeEstimate === 'number' ? resp.data.resultSizeEstimate : 0;
    this.logger.log(`email readout connector=gmail user=${userId} count=${count}`);
    return { kind: 'email', count };
  }

  // ── imap-email:IMAP SEARCH UNSEEN 计数 ─────────────────────────

  private async imapUnread(userId: string): Promise<CalendarEmailReadout> {
    const row = await this.connectorRepo.findOne({
      where: { userId, connectorId: 'imap-email' },
    });
    if (!row || !row.enabled) {
      throw new BadRequestException('IMAP 邮箱尚未连接');
    }
    const creds = (row.credentials ?? {}) as Record<string, unknown>;
    const host = this.str(creds.host ?? creds.imapHost ?? creds.server);
    const user = this.str(creds.user ?? creds.username ?? creds.email ?? creds.account);
    // 密码可能存在 pass/password,或经 api_key 向导落在 apiKey/token 字段。
    const pass = this.str(creds.pass ?? creds.password ?? creds.token ?? creds.apiKey);
    const port = this.num(creds.port ?? creds.imapPort) ?? IMAP_DEFAULT_PORT;

    if (!host || !user || !pass) {
      throw new BadRequestException('IMAP 连接信息不完整(需 host / user / pass)');
    }

    let count: number;
    try {
      count = await this.imapSearchUnseen({ host, port, user, pass });
    } catch (e: any) {
      // 仅记错误简述,不记凭据 / 邮件内容(R6.8)。
      this.logger.warn(
        `email readout failed connector=imap-email user=${userId} reason=${e?.message ?? 'imap-error'}`,
      );
      throw new BadRequestException('读取 IMAP 未读失败,请检查邮箱连接信息');
    }

    this.logger.log(`email readout connector=imap-email user=${userId} count=${count}`);
    return { kind: 'email', count };
  }

  // ── system-calendar:端侧回传计数 ───────────────────────────────

  private systemCalendar(options: ReadoutOptions): CalendarEmailReadout {
    // 系统日历在移动端本地读取(端侧 API),后端仅回传端侧传入的计数(R6.6 兜底,无需 Google)。
    const count =
      typeof options.clientCount === 'number' && options.clientCount >= 0
        ? Math.floor(options.clientCount)
        : 0;
    const items =
      Array.isArray(options.clientItems) && options.clientItems.length
        ? options.clientItems.filter((s) => typeof s === 'string' && s.length > 0)
        : undefined;
    return { kind: 'calendar', count, items: items && items.length ? items : undefined };
  }

  // ── 内部:今日时间边界 ─────────────────────────────────────────

  /**
   * 计算「今日 0 点 ~ 次日 0 点」的 ISO 时间(供 Calendar events.list 的 timeMin/timeMax)。
   * 提供 tzOffsetMinutes(UTC 以东分钟数)时按该时区取墙钟午夜;否则用服务器本地时区。
   */
  private todayBounds(tzOffsetMinutes?: number): { timeMin: string; timeMax: string } {
    if (typeof tzOffsetMinutes === 'number' && Number.isFinite(tzOffsetMinutes)) {
      const offsetMs = tzOffsetMinutes * 60 * 1000;
      const local = new Date(Date.now() + offsetMs);
      const startLocalMs = Date.UTC(
        local.getUTCFullYear(),
        local.getUTCMonth(),
        local.getUTCDate(),
      );
      const startUtcMs = startLocalMs - offsetMs;
      return {
        timeMin: new Date(startUtcMs).toISOString(),
        timeMax: new Date(startUtcMs + 24 * 60 * 60 * 1000).toISOString(),
      };
    }
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    return { timeMin: start.toISOString(), timeMax: end.toISOString() };
  }

  // ── 内部:最小 IMAP-over-TLS 客户端(零依赖,Node 内置 tls)──────

  /**
   * 通过隐式 TLS 连接 IMAP 服务器,执行 LOGIN → SELECT INBOX → SEARCH UNSEEN,返回未读条数。
   * 命令串行(收到上一条的 tagged 完成后才发下一条),最后 LOGOUT(fire-and-forget)。
   */
  private imapSearchUnseen(opts: {
    host: string;
    port: number;
    user: string;
    pass: string;
  }): Promise<number> {
    return new Promise<number>((resolve, reject) => {
      let settled = false;
      const finish = (err: Error | null, val?: number) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try {
          socket.destroy();
        } catch {
          /* ignore */
        }
        if (err) reject(err);
        else resolve(val ?? 0);
      };

      const timer = setTimeout(() => finish(new Error('IMAP 连接超时')), IMAP_TIMEOUT_MS);

      const socket = tls.connect({
        host: opts.host,
        port: opts.port,
        servername: opts.host,
      });
      socket.setEncoding('utf8');

      let buf = '';
      let tagNum = 0;
      let currentTag = '';
      let phase: 'greeting' | 'login' | 'select' | 'search' = 'greeting';
      let unseen = 0;

      const quote = (s: string) =>
        '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
      const send = (cmd: string) => {
        tagNum += 1;
        currentTag = `A${tagNum}`;
        socket.write(`${currentTag} ${cmd}\r\n`);
      };
      const tagged = (line: string, status: string) =>
        new RegExp(`^${currentTag} ${status}\\b`, 'i').test(line);

      const handleLine = (line: string) => {
        // 未标记的 SEARCH 结果:`* SEARCH 1 2 3`
        if (phase === 'search' && /^\* SEARCH\b/i.test(line)) {
          const ids = line.replace(/^\* SEARCH/i, '').trim();
          unseen = ids.length ? ids.split(/\s+/).filter(Boolean).length : 0;
          return;
        }
        switch (phase) {
          case 'greeting':
            if (/^\* (OK|PREAUTH)\b/i.test(line)) {
              phase = 'login';
              send(`LOGIN ${quote(opts.user)} ${quote(opts.pass)}`);
            } else if (/^\* (NO|BAD|BYE)\b/i.test(line)) {
              finish(new Error('IMAP 服务器拒绝连接'));
            }
            break;
          case 'login':
            if (tagged(line, 'OK')) {
              phase = 'select';
              send(`SELECT ${quote('INBOX')}`);
            } else if (tagged(line, 'NO') || tagged(line, 'BAD')) {
              finish(new Error('IMAP 登录失败'));
            }
            break;
          case 'select':
            if (tagged(line, 'OK')) {
              phase = 'search';
              send('SEARCH UNSEEN');
            } else if (tagged(line, 'NO') || tagged(line, 'BAD')) {
              finish(new Error('IMAP 选择收件箱失败'));
            }
            break;
          case 'search':
            if (tagged(line, 'OK')) {
              const result = unseen;
              try {
                send('LOGOUT');
              } catch {
                /* ignore */
              }
              finish(null, result);
            } else if (tagged(line, 'NO') || tagged(line, 'BAD')) {
              finish(new Error('IMAP 搜索未读失败'));
            }
            break;
        }
      };

      socket.on('data', (chunk: string) => {
        buf += chunk;
        let idx: number;
        while ((idx = buf.indexOf('\r\n')) >= 0) {
          const line = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          handleLine(line);
        }
      });
      socket.on('error', (e) =>
        finish(e instanceof Error ? e : new Error('IMAP socket error')),
      );
      socket.on('close', () => finish(new Error('IMAP 连接已关闭')));
    });
  }

  // ── 内部:credentials 取值小工具 ───────────────────────────────

  private str(v: unknown): string | undefined {
    return typeof v === 'string' && v.trim().length > 0 ? v.trim() : undefined;
  }

  private num(v: unknown): number | undefined {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim().length > 0) {
      const n = Number(v);
      return Number.isFinite(n) ? n : undefined;
    }
    return undefined;
  }
}
