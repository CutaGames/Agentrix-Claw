import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { WorldPlot } from '../entities/world-plot.entity';
import { PlotListing } from '../entities/plot-listing.entity';
import { AgentAccountService } from '../../agent-account/agent-account.service';
import { AxpService } from '../../axp/axp.service';
import {
  PLOT_PRICE_USD_MIN,
  PLOT_PRICE_USD_MAX,
  PLOT_PRICE_AXP_MIN,
  PLOT_PRICE_AXP_MAX,
  REVENUE_SHARE_FIRST_SALE,
  REVENUE_SHARE_SECONDARY_SALE,
} from '../../../../shared/types/world-creation';
import type {
  PlotSaleType,
} from '../../../../shared/types/world-creation';
import type { MarketplaceCurrency } from '../../../../shared/types/world-engine-api';
import type {
  AcquirePlotRequest,
  AcquirePlotResponse,
  ListPlotForSaleRequest,
  ListPlotForSaleResponse,
  PlotDto,
  TransferPlotRequest,
  TransferPlotResponse,
} from '../../../../shared/types/world-creation-api';

/**
 * AXP→USD 兑率 (与 EconomyBridgeService 对齐：1 AXP = $0.001 USD)。
 * USD 标价的地块结算统一折算为 AXP 走钱包记账。
 */
const AXP_TO_USD = 0.001;

/**
 * LandEconomyService — 稀缺地块所有权与转让 (design §7 Land_Economy, R2).
 *
 * 有限网格的 world_plots 制造稀缺；获取 / 转让走两阶段提交 + 乐观锁
 * (@VersionColumn)：`UPDATE ... WHERE id=? AND version=?`，并发争抢仅一人成功，
 * 另一人收到 PLOT_TAKEN。抽成一级 5% / 二级 30% 复用 v5 经济模型。
 *
 * 上架 / 转让 (listForSale / transferPlot) 见 Task 8.3。
 */
@Injectable()
export class LandEconomyService {
  private readonly logger = new Logger(LandEconomyService.name);

  /**
   * 预留窗口 (R2.6)：两阶段转让在 reserve 后必须在此窗口内 commit，
   * 否则释放预留 + 全额退款 + 所有权不变。protected 便于单元测试覆写 (task 8.4)。
   */
  protected readonly RESERVATION_TIMEOUT_MS = 30_000;

  constructor(
    @InjectRepository(WorldPlot)
    private readonly plotRepo: Repository<WorldPlot>,
    @InjectRepository(PlotListing)
    private readonly listingRepo: Repository<PlotListing>,
    private readonly agentAccountService: AgentAccountService,
    // 复用 v5 AXP 钱包做付款 / 抽成净额入账 / 失败全额退款 (design §6/§7, R2.5/R2.6)。
    private readonly axpService: AxpService,
  ) {}

  /**
   * R2.2 / R2.3 / R2.7 — 乐观锁获取稀缺地块，并发争抢有且仅有一人成功。
   *
   * 核心是一条 **原子条件 UPDATE** (design §7.1 序列图)：
   * `UPDATE world_plots SET owner=…, version=version+1
   *    WHERE id=? AND version=? AND owner_account_id IS NULL`。
   *
   * - `version = expectedVersion`：乐观锁，拒绝陈旧版本写入。
   * - `ownerAccountId IS NULL`：仅可从"未拥有"翻转为"已拥有"，保证单赢家
   *   (Property 5)；并发下只有一条 UPDATE 能命中 NULL 行，其余 `affected = 0`。
   *
   * 命中 (`affected === 1`) → 获取成功，绑定 **单一** owner AgentAccount +
   * 声明的 Substrate_Tier (R2.7)。`affected === 0` → 已被他人获取或版本陈旧
   * → 返回结构化 `PLOT_TAKEN` (R2.3)。地块不存在 → 404。
   *
   * 此方法被 Property 5（乐观锁单赢家，Task 8.2）属性测试驱动。
   */
  async acquirePlot(
    userId: string,
    req: AcquirePlotRequest,
  ): Promise<AcquirePlotResponse> {
    if (!userId) {
      throw new BadRequestException('Missing authenticated user');
    }
    if (!req?.plotId) {
      throw new BadRequestException('plotId is required');
    }
    if (typeof req.expectedVersion !== 'number') {
      throw new BadRequestException('expectedVersion is required for the optimistic-lock acquire');
    }

    // 解析获取者的单一 owner AgentAccount (复用 v5 AgentAccount, R2.7)。
    const ownerAccountId = await this.resolveOwnerAccountId(userId);

    // 原子乐观锁获取：仅当 version 匹配且地块尚未被拥有时翻转所有权。
    // 使用实体属性名 (camelCase)，列名由全局 SnakeNamingStrategy 自动派生
    // (禁手写 snake_case 列名)。`version + 1` 由 Repository.update 不会自动
    // 递增 @VersionColumn，故显式自增以体现 version→N+1 (design §7.1)。
    const result = await this.plotRepo.update(
      {
        id: req.plotId,
        version: req.expectedVersion,
        ownerAccountId: IsNull(),
      },
      {
        ownerAccountId,
        originalCreatorAccountId: ownerAccountId,
        substrateTier: req.substrateTier,
        status: 'draft',
        version: () => 'version + 1',
      },
    );

    if (result.affected === 1) {
      const plot = await this.plotRepo.findOne({ where: { id: req.plotId } });
      if (!plot) {
        // 理论不可达：刚写入即消失。
        throw new NotFoundException(`Plot ${req.plotId} disappeared after acquire`);
      }
      this.logger.log(
        `Plot ${req.plotId} acquired by account ${ownerAccountId} (tier=${req.substrateTier}, version→${plot.version})`,
      );
      return { acquired: true, plot: this.toPlotDto(plot) };
    }

    // 未命中：区分"地块不存在" vs "已被他人获取 / 版本陈旧"。
    const existing = await this.plotRepo.findOne({ where: { id: req.plotId } });
    if (!existing) {
      throw new NotFoundException(`Plot ${req.plotId} not found`);
    }

    this.logger.log(
      `Plot ${req.plotId} acquire lost (expectedVersion=${req.expectedVersion}, actualVersion=${existing.version}, owned=${existing.ownerAccountId !== null})`,
    );
    return {
      acquired: false,
      error: {
        error: 'PLOT_TAKEN',
        detail: `Plot ${req.plotId} is no longer available — it was acquired by another user.`,
      },
    };
  }

  /**
   * 解析用户的单一 owner AgentAccount id (复用 v5 AgentAccount)。
   * 用户尚无 AgentAccount 时拒绝获取。
   */
  private async resolveOwnerAccountId(userId: string): Promise<string> {
    const { items } = await this.agentAccountService.findByOwner(userId, 1, 1);
    if (!items?.length) {
      throw new BadRequestException(
        'No AgentAccount found for the current user; an AgentAccount is required to own a Plot.',
      );
    }
    return items[0].id;
  }

  /** 将 WorldPlot 实体映射为 API PlotDto。 */
  private toPlotDto(plot: WorldPlot): PlotDto {
    return {
      plotId: plot.id,
      ownerAccountId: plot.ownerAccountId ?? '',
      title: plot.title ?? '',
      substrateTier: plot.substrateTier,
      ecsVersionId: plot.ecsVersionId ?? '',
      mapX: plot.mapX,
      mapY: plot.mapY,
      status: plot.status,
      version: plot.version,
      createdAt: plot.createdAt?.toISOString?.() ?? '',
      updatedAt: plot.updatedAt?.toISOString?.() ?? '',
    };
  }

  /**
   * R2.4 上架地块到 Marketplace。
   *
   * 校验价格区间 (shared 常量)：USD 0.01–999,999.99 或 AXP 1–10,000,000，越界拒绝。
   * 仅 Plot 当前 owner 可上架；同一 Plot 不可重复挂活跃 listing。写入 PlotListing
   * (status='active')，并把 Plot 标记为 'listed'。saleType 由调用方提供，决定后续转让
   * 抽成档位 (first 5% / secondary 30%)。
   *
   * @param userId 经认证的发起用户 (= 卖家)。
   */
  async listForSale(
    userId: string,
    plotId: string,
    req: ListPlotForSaleRequest,
  ): Promise<ListPlotForSaleResponse> {
    if (!userId) {
      throw new BadRequestException('Missing authenticated user');
    }
    if (!plotId) {
      throw new BadRequestException('plotId is required');
    }
    if (!req) {
      throw new BadRequestException('listing payload is required');
    }

    // 价格区间校验 (R2.4)：越界即拒，绝不写库。
    this.validatePrice(req.price, req.currency);

    const plot = await this.plotRepo.findOne({ where: { id: plotId } });
    if (!plot) {
      throw new NotFoundException(`Plot ${plotId} not found`);
    }

    // 仅当前 owner 可上架。
    const sellerAccountId = await this.resolveOwnerAccountId(userId);
    if (!plot.ownerAccountId || plot.ownerAccountId !== sellerAccountId) {
      throw new ForbiddenException('Only the Plot owner may list it for sale');
    }

    // 同一 Plot 已有活跃 listing → 拒绝重复上架。
    const existing = await this.listingRepo.findOne({
      where: { plotId, status: 'active' },
    });
    if (existing) {
      throw new ConflictException(
        `Plot ${plotId} already has an active listing (${existing.id})`,
      );
    }

    const listing = this.listingRepo.create({
      plotId,
      sellerAccountId,
      // numeric/bigint 列以字符串存储；按币种二选一，另一币种留 null。
      priceUsd: req.currency === 'USD' ? req.price.toFixed(2) : null,
      priceAxp: req.currency === 'AXP' ? String(req.price) : null,
      saleType: req.saleType,
      status: 'active',
    });
    const saved = await this.listingRepo.save(listing);

    // 反映 Plot 进入挂牌状态。
    plot.status = 'listed';
    await this.plotRepo.save(plot);

    this.logger.log(
      `Plot ${plotId} listed by account ${sellerAccountId} ` +
        `(${req.price} ${req.currency}, saleType=${req.saleType}, listing=${saved.id})`,
    );

    return { listingId: saved.id, status: saved.status };
  }

  /**
   * R2.5 / R2.6 两阶段所有权转移 + 平台抽成。
   *
   * 复用 v5 marketplace 两阶段提交模式：
   *  - **Phase 1 Reserve**：校验 listing 活跃、买家有 AgentAccount、非自购、签名确认存在，
   *    快照 Plot/Listing 的 `@VersionColumn`，并从买家 AXP 钱包 **全额扣款** (预留资金)。
   *  - **预留窗口 (R2.6)**：若 reserve 后超出 {@link RESERVATION_TIMEOUT_MS} 仍未 commit，
   *    释放预留 + 全额退款 + 所有权不变。
   *  - **Phase 2 Commit**：单 DB 事务内乐观锁校验 (version 与快照一致、卖家仍持有、listing
   *    仍活跃)，翻转 `ownerAccountId` 并把 listing 置 'sold'。version 不匹配 → 事务回滚。
   *
   * 转让 commit 成功后按 saleType 应用平台抽成 (一级 5% / 二级 30%)，净额入卖家 AgentAccount
   * 钱包 (R2.5)。任一校验失败 / 预留超时 / 事务回滚 → 释放预留 + 全额退款 + 所有权不变 (R2.6)。
   *
   * @param userId 经认证的发起用户 (= 买家)。
   */
  async transferPlot(
    userId: string,
    req: TransferPlotRequest,
  ): Promise<TransferPlotResponse> {
    if (!userId) {
      throw new BadRequestException('Missing authenticated user');
    }
    if (!req?.listingId) {
      throw new BadRequestException('listingId is required');
    }

    // Trust 门控：Marketplace 购买要求签名确认 (R2.5/§Trust)。缺失即拒，未触碰任何余额。
    if (!req.signedConfirmation) {
      return {
        committed: false,
        error: {
          error: 'ECONOMY_REJECTED',
          detail: 'A signed confirmation is required to transfer Plot ownership.',
        },
      };
    }

    const listing = await this.listingRepo.findOne({ where: { id: req.listingId } });
    if (!listing) {
      throw new NotFoundException(`Listing ${req.listingId} not found`);
    }
    if (listing.status !== 'active') {
      return {
        committed: false,
        error: {
          error: 'ECONOMY_REJECTED',
          detail: `Listing ${req.listingId} is not available (status=${listing.status}).`,
        },
      };
    }

    const plot = await this.plotRepo.findOne({ where: { id: listing.plotId } });
    if (!plot) {
      throw new NotFoundException(`Plot ${listing.plotId} not found`);
    }

    // 买家必须拥有 AgentAccount (成为新 owner)；禁止自购。
    const buyerAccountId = await this.resolveOwnerAccountId(userId);
    if (buyerAccountId === listing.sellerAccountId) {
      throw new BadRequestException('Cannot purchase your own listing');
    }

    // 服务端权威结算金额：从 listing 记录重算 (AXP 直接、USD 折算为 AXP)。
    const { amountAxp, nativeAmount } = this.resolveSettlement(listing);
    const platformCut = this.computePlatformCut(amountAxp, listing.saleType);
    const sellerCredit = amountAxp - platformCut;

    // 乐观锁快照 (两阶段提交基础)。
    const reservedAt = Date.now();
    const plotVersion = plot.version;
    const listingVersion = listing.version;

    // ── Phase 1 Reserve：全额扣买家钱包 (预留资金) ───────────────────────
    try {
      await this.axpService.spend({
        userId,
        source: 'plot_purchase',
        amount: amountAxp,
        refId: plot.id,
        note: `Plot transfer reserve (${plot.title ?? plot.id})`,
        metadata: {
          plotId: plot.id,
          listingId: listing.id,
          authoritativeAmount: amountAxp,
          nativeAmount,
          currency: listing.priceAxp != null ? 'AXP' : 'USD',
        },
      });
    } catch (err) {
      // spend 在扣款前原子校验余额；抛错即余额未变 (R2.6)。
      return {
        committed: false,
        error: {
          error: 'ECONOMY_REJECTED',
          detail: this.toDetail(err, 'charge failed (insufficient balance or invalid)'),
        },
      };
    }

    // 预留窗口超时 (R2.6)：释放预留 + 全额退款 + 所有权不变。
    if (Date.now() - reservedAt > this.RESERVATION_TIMEOUT_MS) {
      await this.refundBuyer(userId, amountAxp, plot.id, 'reservation window elapsed');
      return {
        committed: false,
        error: {
          error: 'ECONOMY_REJECTED',
          detail: 'Reservation window elapsed before commit; buyer refunded in full.',
        },
      };
    }

    // ── Phase 2 Commit：单事务 + 乐观锁翻转所有权 ────────────────────────
    try {
      await this.plotRepo.manager.transaction(async (em) => {
        const txPlot = await em.findOne(WorldPlot, { where: { id: plot.id } });
        if (!txPlot) {
          throw new NotFoundException(`Plot ${plot.id} no longer exists`);
        }
        // 乐观锁：version 与快照不一致 → 并发修改，回滚。
        if (txPlot.version !== plotVersion) {
          throw new ConflictException(
            'Plot was modified concurrently (version mismatch). Transfer rolled back.',
          );
        }
        // 卖家必须仍持有该 Plot。
        if (txPlot.ownerAccountId !== listing.sellerAccountId) {
          throw new ConflictException(
            'Seller no longer owns the Plot. Transfer rolled back.',
          );
        }

        const txListing = await em.findOne(PlotListing, { where: { id: listing.id } });
        if (!txListing) {
          throw new NotFoundException(`Listing ${listing.id} no longer exists`);
        }
        if (txListing.version !== listingVersion) {
          throw new ConflictException(
            'Listing was modified concurrently (version mismatch). Transfer rolled back.',
          );
        }
        if (txListing.status !== 'active') {
          throw new ConflictException(
            `Listing is no longer active (status=${txListing.status}). Transfer rolled back.`,
          );
        }

        // 翻转所有权 → 买家；新 owner 尚未发布，回到 draft。
        txPlot.ownerAccountId = buyerAccountId;
        txPlot.status = 'draft';
        await em.save(WorldPlot, txPlot);

        // listing 成交。
        txListing.status = 'sold';
        await em.save(PlotListing, txListing);
      });
    } catch (err) {
      // 转让校验失败 / 事务回滚 → 释放预留 + 全额退款 + 所有权不变 (R2.6)。
      await this.refundBuyer(userId, amountAxp, plot.id, 'transfer validation failed');
      this.logger.warn(
        `Plot transfer rolled back for listing ${listing.id}: ${this.toDetail(err, 'unknown')}`,
      );
      return {
        committed: false,
        error: {
          error: 'ECONOMY_REJECTED',
          detail: this.toDetail(err, 'transfer validation failed; buyer refunded'),
        },
      };
    }

    // ── 抽成结算 (R2.5)：净额入卖家钱包；平台抽成为差额扣留 ───────────────
    const sellerUserId = await this.resolveAccountUserId(listing.sellerAccountId);
    if (sellerUserId && sellerCredit > 0) {
      try {
        await this.axpService.earn({
          userId: sellerUserId,
          source: 'plot_revenue',
          amount: sellerCredit,
          refId: plot.id,
          note: `Plot sale revenue (net of ${platformCut} AXP platform cut, ${listing.saleType})`,
          metadata: {
            plotId: plot.id,
            listingId: listing.id,
            gross: amountAxp,
            platformCut,
            saleType: listing.saleType,
          },
        });
      } catch (err) {
        // 所有权已转移、买家已扣款；卖家入账失败仅告警 (差额对账由离线流程处理)，
        // 不回滚所有权 (与 EconomyBridgeService 成本记录失败处理一致)。
        this.logger.error(
          `Seller credit failed for listing ${listing.id} (account ${listing.sellerAccountId}): ` +
            this.toDetail(err, 'unknown'),
        );
      }
    }

    this.logger.log(
      `Plot ${plot.id} transferred to account ${buyerAccountId} ` +
        `(amount=${amountAxp} AXP, platformCut=${platformCut}, saleType=${listing.saleType})`,
    );

    return {
      committed: true,
      newOwnerAccountId: buyerAccountId,
      authoritativeAmount: nativeAmount,
    };
  }

  // ============================================================
  // Task 8.3 helpers
  // ============================================================

  /**
   * R2.4 价格区间校验：USD 0.01–999,999.99 或 AXP 1–10,000,000 (shared 常量)。
   * 越界 / 非法币种 / 非整数 AXP → BadRequestException。
   */
  private validatePrice(price: number, currency: MarketplaceCurrency): void {
    if (typeof price !== 'number' || !Number.isFinite(price)) {
      throw new BadRequestException('price must be a finite number');
    }
    if (currency === 'USD') {
      if (price < PLOT_PRICE_USD_MIN || price > PLOT_PRICE_USD_MAX) {
        throw new BadRequestException(
          `USD price must be between ${PLOT_PRICE_USD_MIN} and ${PLOT_PRICE_USD_MAX}`,
        );
      }
    } else if (currency === 'AXP') {
      if (!Number.isInteger(price)) {
        throw new BadRequestException('AXP price must be an integer');
      }
      if (price < PLOT_PRICE_AXP_MIN || price > PLOT_PRICE_AXP_MAX) {
        throw new BadRequestException(
          `AXP price must be between ${PLOT_PRICE_AXP_MIN} and ${PLOT_PRICE_AXP_MAX}`,
        );
      }
    } else {
      throw new BadRequestException(`Unsupported currency: ${String(currency)}`);
    }
  }

  /**
   * 服务端权威结算金额。AXP 标价直接用；USD 标价按 AXP_TO_USD 折算为 AXP 钱包记账。
   * 返回 amountAxp (钱包记账单位) 与 nativeAmount (listing 标价，用于响应回显)。
   */
  private resolveSettlement(listing: PlotListing): {
    amountAxp: number;
    nativeAmount: number;
  } {
    if (listing.priceAxp != null) {
      const axp = Number(listing.priceAxp);
      return { amountAxp: axp, nativeAmount: axp };
    }
    if (listing.priceUsd != null) {
      const usd = Number(listing.priceUsd);
      // usd / 0.001 = usd * 1000，四舍五入到整数 AXP。
      return { amountAxp: Math.round(usd / AXP_TO_USD), nativeAmount: usd };
    }
    throw new BadRequestException(`Listing ${listing.id} has no price`);
  }

  /** 平台抽成：一级 5% / 二级 30% (REVENUE_SHARE 常量，design §6, R2.5)。 */
  private computePlatformCut(amountAxp: number, saleType: PlotSaleType): number {
    const rate =
      saleType === 'secondary'
        ? REVENUE_SHARE_SECONDARY_SALE
        : REVENUE_SHARE_FIRST_SALE;
    return Math.round(amountAxp * rate);
  }

  /** AgentAccount id → 其 owner userId (AXP 钱包以 userId 为键)。 */
  private async resolveAccountUserId(accountId: string): Promise<string | null> {
    try {
      const account = await this.agentAccountService.findById(accountId);
      return account?.ownerId ?? null;
    } catch {
      return null;
    }
  }

  /** 转让失败 / 预留超时时全额退款买家，保证余额最终不变 (R2.6)。 */
  private async refundBuyer(
    userId: string,
    amountAxp: number,
    plotId: string,
    reason: string,
  ): Promise<void> {
    if (amountAxp <= 0) return;
    try {
      await this.axpService.earn({
        userId,
        source: 'plot_payout',
        amount: amountAxp,
        refId: plotId,
        note: `Plot transfer refund: ${reason}`,
        metadata: { plotId, refund: true, reason },
      });
    } catch (err) {
      this.logger.error(
        `Refund failed for buyer ${userId} on plot ${plotId} (${amountAxp} AXP): ` +
          this.toDetail(err, 'unknown'),
      );
    }
  }

  private toDetail(err: unknown, fallback: string): string {
    if (err instanceof Error) return err.message;
    if (typeof err === 'string') return err;
    return fallback;
  }
}
