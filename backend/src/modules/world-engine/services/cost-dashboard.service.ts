import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AgentCostRecord } from '../../../entities/agent-cost-record.entity';

/**
 * Cost summary record for the admin dashboard.
 */
export interface CostSummaryRecord {
  provider: string;
  userId: string | null;
  date: string;
  totalCostUsd: number;
  requestCount: number;
  avgLatencyMs: number;
}

/**
 * CostDashboardService — Admin cost dashboard and materialized view management.
 *
 * Implements:
 * - 19.5: Admin cost dashboard endpoint
 * - PostgreSQL materialized view aggregating by Provider × userId × day
 * - Cron: REFRESH MATERIALIZED VIEW CONCURRENTLY every 15 min
 *
 * Requirements: 13.7
 */
@Injectable()
export class CostDashboardService {
  private readonly logger = new Logger(CostDashboardService.name);

  /** Materialized view name */
  private readonly MV_NAME = 'world_engine_cost_summary_mv';

  /** Refresh interval: 15 minutes */
  private readonly REFRESH_INTERVAL_MS = 15 * 60 * 1000;

  private refreshTimer: NodeJS.Timeout | null = null;

  constructor(
    @InjectRepository(AgentCostRecord)
    private readonly costRecordRepo: Repository<AgentCostRecord>,
  ) {
    // Start periodic refresh (Phase 1: query-based, no actual MV)
    this.startPeriodicRefresh();
  }

  /**
   * Get cost summary aggregated by Provider × userId × day.
   *
   * @param filters - Optional filters for date range, provider, userId
   * @returns Array of cost summary records
   *
   * Requirements: 13.7
   */
  async getCostSummary(filters?: {
    startDate?: string;
    endDate?: string;
    provider?: string;
    userId?: string;
    limit?: number;
  }): Promise<{
    items: CostSummaryRecord[];
    totals: { totalCostUsd: number; totalRequests: number };
  }> {
    const { startDate, endDate, provider, userId, limit = 100 } = filters || {};

    try {
      let query = this.costRecordRepo
        .createQueryBuilder('cost')
        .select('cost.provider', 'provider')
        .addSelect('cost.userId', 'userId')
        .addSelect("TO_CHAR(cost.createdAt, 'YYYY-MM-DD')", 'date')
        .addSelect('COALESCE(SUM(cost.costUsd), 0)', 'totalCostUsd')
        .addSelect('COUNT(*)', 'requestCount')
        .addSelect('COALESCE(AVG(cost.latencyMs), 0)', 'avgLatencyMs')
        .where("cost.routingReason LIKE 'world_engine%' OR cost.routingReason LIKE 'share-%'")
        .groupBy('cost.provider')
        .addGroupBy('cost.userId')
        .addGroupBy("TO_CHAR(cost.createdAt, 'YYYY-MM-DD')")
        .orderBy("TO_CHAR(cost.createdAt, 'YYYY-MM-DD')", 'DESC')
        .limit(limit);

      if (startDate) {
        query = query.andWhere('cost.createdAt >= :startDate', { startDate });
      }
      if (endDate) {
        query = query.andWhere('cost.createdAt <= :endDate', { endDate });
      }
      if (provider) {
        query = query.andWhere('cost.provider = :provider', { provider });
      }
      if (userId) {
        query = query.andWhere('cost.userId = :userId', { userId });
      }

      const rawResults = await query.getRawMany();

      const items: CostSummaryRecord[] = rawResults.map((row) => ({
        provider: row.provider || 'unknown',
        userId: row.userId,
        date: row.date,
        totalCostUsd: parseFloat(row.totalCostUsd) || 0,
        requestCount: parseInt(row.requestCount, 10) || 0,
        avgLatencyMs: parseFloat(row.avgLatencyMs) || 0,
      }));

      // Calculate totals
      const totalCostUsd = items.reduce((sum, item) => sum + item.totalCostUsd, 0);
      const totalRequests = items.reduce((sum, item) => sum + item.requestCount, 0);

      return {
        items,
        totals: {
          totalCostUsd: Math.round(totalCostUsd * 100) / 100,
          totalRequests,
        },
      };
    } catch (error) {
      this.logger.error(`Failed to get cost summary: ${error.message}`);
      return { items: [], totals: { totalCostUsd: 0, totalRequests: 0 } };
    }
  }

  /**
   * Create or refresh the materialized view.
   *
   * Phase 1: Uses a direct query (no actual MV creation since it requires
   * a migration). In production, the MV would be created by a migration
   * and refreshed concurrently here.
   */
  async refreshMaterializedView(): Promise<void> {
    try {
      // Phase 1: Just log the refresh attempt
      // In production, this would be:
      // await this.costRecordRepo.manager.query(
      //   `REFRESH MATERIALIZED VIEW CONCURRENTLY ${this.MV_NAME}`
      // );
      this.logger.debug('Cost summary materialized view refresh triggered (Phase 1: no-op)');
    } catch (error) {
      this.logger.error(`Failed to refresh materialized view: ${error.message}`);
    }
  }

  /**
   * Start periodic refresh of the materialized view (every 15 minutes).
   */
  private startPeriodicRefresh(): void {
    this.refreshTimer = setInterval(() => {
      this.refreshMaterializedView().catch((err) => {
        this.logger.error(`Periodic MV refresh failed: ${err.message}`);
      });
    }, this.REFRESH_INTERVAL_MS);

    // Don't prevent process exit
    if (this.refreshTimer.unref) {
      this.refreshTimer.unref();
    }
  }
}
