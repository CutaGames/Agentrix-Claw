import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import axios from 'axios';
import { UserConnector } from './user-connector.entity';
import { CONNECTORS, getConnector, type ConnectorDef } from './connector-catalog';
import { ConnectorOAuthService } from './connector-oauth.service';
import { OpenAPIImporterService } from '../skill/openapi-importer.service';
import { McpServerRegistryService } from '../mcp-registry/mcp-server-registry.service';
import { RealityLoopService } from '../aeon/reality/reality-loop.service';
import { WorldNewsService } from '../aeon/news/world-news.service';
import type {
  ConnectorCatalogItem,
  ConnectorInstallInput,
  ConnectorInstallResult,
  AgentErrandResult,
} from '../../../../shared/types/connector';

/**
 * ConnectorService — 连接器/插件库的市场化封装(目录 + 一键装 + 鉴权 + 执行 + 玩法A闭环)。
 *
 * 目录(catalog)是静态精选清单;用户"装"一个连接器后落 UserConnector:
 *   - builtin → 直接 enable(执行在本服务内置,如 crypto/weather);
 *   - openapi → 经 OpenAPIImporterService 导入为 http skill(鉴权头烘焙),记 importedSkillId;
 *   - mcp     → 经 McpServerRegistryService 注册 + 发现,记 mcpServerId。
 *
 * 玩法 A(派 agent 出门办事):runErrand 调用 builtin 连接器办一件真事(查行情/天气),
 * 成功后经 RealityLoopService.rewardFromReality 发 aeon_reality_reward AXP + 写世界新闻 —— 
 * "对话里派 agent 办成真事 → 游戏里产出 AXP"端到端闭环。
 */
@Injectable()
export class ConnectorService {
  private readonly logger = new Logger(ConnectorService.name);

  constructor(
    @InjectRepository(UserConnector)
    private readonly repo: Repository<UserConnector>,
    private readonly openapiImporter: OpenAPIImporterService,
    private readonly mcpRegistry: McpServerRegistryService,
    private readonly reality: RealityLoopService,
    private readonly news: WorldNewsService,
    private readonly oauth: ConnectorOAuthService,
  ) {}

  /** 目录 + 该用户已安装标记。 */
  async catalog(userId: string): Promise<ConnectorCatalogItem[]> {
    const installed = await this.repo.find({ where: { userId } });
    const byId = new Map(installed.map((u) => [u.connectorId, u]));
    return CONNECTORS.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      icon: c.icon,
      category: c.category,
      kind: c.kind,
      status: c.status,
      authKind: c.authKind,
      authHeaderName: c.authHeaderName,
      reality: c.reality,
      chinaAvailable: c.chinaAvailable,
      rewardAxp: c.rewardAxp,
      installed: byId.has(c.id),
      enabled: byId.get(c.id)?.enabled ?? false,
    }));
  }

  /** 我已安装的连接器。 */
  async listInstalled(userId: string): Promise<UserConnector[]> {
    return this.repo.find({ where: { userId }, order: { createdAt: 'DESC' } });
  }

  /** 一键安装(鉴权向导收集的 credentials 一并存)。 */
  async install(userId: string, input: ConnectorInstallInput): Promise<ConnectorInstallResult> {
    const def = getConnector(input.connectorId);
    if (!def) throw new NotFoundException('连接器不存在');
    if (def.status === 'coming_soon') {
      throw new BadRequestException(`「${def.name}」即将上线,敬请期待`);
    }

    // oauth 类:不在此处直接落库,改为返回授权跳转 URL 引导前端跳转(§5.3,R6.2)。
    // 真正的安装(落 OAuthToken + UserConnector)在 ConnectorOAuthService.handleCallback 完成。
    if (def.authKind === 'oauth') {
      const { url } = this.oauth.authorizeUrl(userId, def.id);
      return {
        ok: true,
        connectorId: def.id,
        installed: false,
        needsOAuth: true,
        authorizeUrl: url,
        message: `请完成「${def.name}」的授权`,
      };
    }

    // 鉴权校验:需要 key/token 的必须提供。
    if (def.authKind === 'api_key' && !input.credentials?.apiKey) {
      throw new BadRequestException('该连接器需要 API Key');
    }
    if (def.authKind === 'bearer' && !input.credentials?.token) {
      throw new BadRequestException('该连接器需要 Bearer Token');
    }

    let importedSkillId: string | null = null;
    let mcpServerId: string | null = null;
    const tools: string[] = [];

    if (def.kind === 'openapi') {
      if (!def.openapiUrl) throw new BadRequestException('连接器缺少 openapiUrl');
      const result = await this.openapiImporter.importFromUrl(def.openapiUrl, {
        source: 'third_party',
        authConfig:
          def.authKind === 'api_key'
            ? { type: 'api_key', apiKey: input.credentials?.apiKey, headerName: def.authHeaderName }
            : def.authKind === 'bearer'
            ? { type: 'bearer', apiKey: input.credentials?.token }
            : { type: 'none' },
      } as any);
      // ImportResult.success = 导入成功的 skill id 列表。
      importedSkillId = result?.success?.[0] ?? null;
    } else if (def.kind === 'mcp') {
      if (!def.mcpUrl) throw new BadRequestException('连接器缺少 mcpUrl');
      try {
        const server = await this.mcpRegistry.registerServer(userId, {
          name: def.name,
          transport: 'http' as any,
          url: def.mcpUrl,
          auth:
            def.authKind === 'bearer'
              ? ({ type: 'bearer', token: input.credentials?.token } as any)
              : undefined,
        });
        mcpServerId = (server as any)?.id ?? null;
        // 注册后立即发现工具(失败不阻断安装)。
        if (mcpServerId) {
          await this.mcpRegistry.discoverTools(mcpServerId).catch((e) =>
            this.logger.warn(`mcp discover failed for ${def.id}: ${e?.message}`),
          );
        }
      } catch (e: any) {
        this.logger.warn(`mcp register failed for connector ${def.id}: ${e?.message}`);
      }
    } else if (def.kind === 'builtin') {
      if (def.builtinTools) tools.push(...def.builtinTools);
    }

    const existing = await this.repo.findOne({ where: { userId, connectorId: def.id } });
    const row =
      existing ??
      this.repo.create({ userId, connectorId: def.id });
    row.enabled = true;
    row.credentials = (input.credentials as Record<string, unknown>) ?? null;
    row.importedSkillId = importedSkillId ?? row.importedSkillId ?? null;
    row.mcpServerId = mcpServerId ?? row.mcpServerId ?? null;
    await this.repo.save(row);

    return {
      ok: true,
      connectorId: def.id,
      installed: true,
      message: `已安装「${def.name}」`,
      tools: tools.length ? tools : undefined,
    };
  }

  /** 卸载。 */
  async uninstall(userId: string, connectorId: string): Promise<{ ok: boolean }> {
    const row = await this.repo.findOne({ where: { userId, connectorId } });
    if (row) await this.repo.remove(row);
    return { ok: true };
  }

  /** 该用户是否已装并启用某连接器。 */
  async isEnabled(userId: string, connectorId: string): Promise<boolean> {
    const row = await this.repo.findOne({ where: { userId, connectorId } });
    return !!row?.enabled;
  }

  // ── builtin 连接器执行 ───────────────────────────────────────────
  /**
   * 执行一个 builtin 连接器办事。返回 { summary, data }。供:
   *   - agent 工具(connector_run)
   *   - 玩法 A 的 runErrand
   */
  async runBuiltin(connectorId: string, args: Record<string, any>): Promise<{ summary: string; data: Record<string, unknown> }> {
    switch (connectorId) {
      case 'crypto-price':
        return this.cryptoPrice(args);
      case 'weather':
        return this.weather(args);
      default:
        throw new BadRequestException(`连接器「${connectorId}」暂不支持自动执行`);
    }
  }

  private async cryptoPrice(args: Record<string, any>): Promise<{ summary: string; data: Record<string, unknown> }> {
    const coin = String(args.coin || args.symbol || 'bitcoin').toLowerCase().trim();
    const vs = String(args.vs || args.currency || 'usd').toLowerCase().trim();
    // CoinGecko 简单价格 API(公开免鉴权)。
    const resp = await axios.get('https://api.coingecko.com/api/v3/simple/price', {
      params: { ids: coin, vs_currencies: vs, include_24hr_change: true },
      timeout: 15000,
    });
    const row = resp.data?.[coin];
    if (!row || row[vs] == null) {
      throw new BadRequestException(`查不到「${coin}」的 ${vs.toUpperCase()} 价格,换个币种试试(如 bitcoin/ethereum/solana)`);
    }
    const price = row[vs];
    const chg = row[`${vs}_24h_change`];
    const chgStr = typeof chg === 'number' ? `${chg >= 0 ? '+' : ''}${chg.toFixed(2)}% (24h)` : '';
    const summary = `${coin.toUpperCase()} = ${price} ${vs.toUpperCase()} ${chgStr}`.trim();
    return { summary, data: { coin, vs, price, change24h: chg } };
  }

  private async weather(args: Record<string, any>): Promise<{ summary: string; data: Record<string, unknown> }> {
    // 先地理编码(Open-Meteo geocoding 公开),再取当前天气。
    const city = String(args.city || args.location || '').trim();
    if (!city) throw new BadRequestException('请提供城市名(city)');
    const geo = await axios.get('https://geocoding-api.open-meteo.com/v1/search', {
      params: { name: city, count: 1 },
      timeout: 15000,
    });
    const place = geo.data?.results?.[0];
    if (!place) throw new BadRequestException(`找不到城市「${city}」`);
    const wx = await axios.get('https://api.open-meteo.com/v1/forecast', {
      params: { latitude: place.latitude, longitude: place.longitude, current_weather: true },
      timeout: 15000,
    });
    const cur = wx.data?.current_weather;
    if (!cur) throw new BadRequestException('天气数据获取失败,请稍后再试');
    const summary = `${place.name} 当前 ${cur.temperature}°C,风速 ${cur.windspeed} km/h`;
    return { summary, data: { city: place.name, temperature: cur.temperature, windspeed: cur.windspeed } };
  }

  // ── 玩法 A:派 agent 出门办事 ────────────────────────────────────
  /**
   * 派 agent 用某连接器办一件真事,成功后发 aeon_reality_reward AXP + 写世界新闻。
   * 真实办事(查到行情/天气)→ 游戏产出(AXP + 城市动态),把工具和游戏缝合。
   */
  async runErrand(
    userId: string,
    connectorId: string,
    args: Record<string, any>,
    agentName?: string,
  ): Promise<AgentErrandResult> {
    const def = getConnector(connectorId);
    if (!def) throw new NotFoundException('连接器不存在');
    if (def.kind !== 'builtin' || def.status !== 'live') {
      throw new BadRequestException(`「${def.name}」暂不支持派 agent 自动办理`);
    }
    // 要求已安装(鼓励先在连接器目录里装)。builtin 免鉴权连接器允许未装直接跑(降低门槛)。
    const { summary, data } = await this.runBuiltin(connectorId, args);

    const reward = def.rewardAxp ?? 10;
    const who = agentName ? `${agentName} 的 agent` : '一名居民的 agent';
    const reason = `${def.name}:${summary}`;
    const credit = await this.reality.rewardFromReality(userId, reward, reason, `errand-${connectorId}-${Date.now()}`);

    return {
      ok: true,
      connectorId,
      summary: `🤖 ${who} 跑了一趟「${def.name}」:${summary} —— 赚得 ${reward} AXP`,
      data,
      rewardAxp: reward,
      bridged: credit.bridged,
      balance: credit.balance,
    };
  }
}
