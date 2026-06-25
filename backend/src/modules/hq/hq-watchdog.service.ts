import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { HqService } from './hq.service';
import { HqGateway } from './hq.gateway';

/**
 * HQ Watchdog Service (Phase 4 - Automation)
 * 
 * 自动化巡检和告警服务：
 * - 定时检查系统健康状态
 * - 监控 Agent 运行状态
 * - 检测异常交易模式
 * - 自动发送告警通知
 */
@Injectable()
export class HqWatchdogService implements OnModuleInit {
  private readonly logger = new Logger(HqWatchdogService.name);
  private isEnabled = true;

  constructor(
    private readonly hqService: HqService,
    private readonly hqGateway: HqGateway,
  ) {}

  onModuleInit() {
    this.logger.log('HQ Watchdog Service initialized');
  }

  /**
   * 每分钟检查 Agent 健康状态
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async checkAgentHealth() {
    if (!this.isEnabled) return;

    try {
      const agents = await this.hqService.getAgentStatuses();
      
      // Check for agents in error state
      const errorAgents = agents.filter(a => a.status === 'error');
      if (errorAgents.length > 0) {
        for (const agent of errorAgents) {
          this.hqService.addAlert(
            'sys',
            `Agent ${agent.name} Error`,
            `Agent ${agent.name} (${agent.id}) is in error state: ${agent.currentTask || 'Unknown error'}`,
          );
          
          // Broadcast via WebSocket
          this.hqGateway.broadcastAlert({
            id: `alert_${Date.now()}`,
            type: 'sys',
            title: `Agent ${agent.name} Error`,
            message: agent.currentTask || 'Unknown error',
            timestamp: new Date().toISOString(),
            read: false,
          });
        }
      }

      // Check for stale agents (no activity for 5 minutes)
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
      const staleAgents = agents.filter(a => {
        const lastActive = new Date(a.lastActive);
        return a.status === 'running' && lastActive < fiveMinutesAgo;
      });

      if (staleAgents.length > 0) {
        this.logger.warn(`Found ${staleAgents.length} stale agents`);
        for (const agent of staleAgents) {
          this.hqService.updateAgentStatus(agent.id, { status: 'paused' });
        }
      }

      this.logger.debug(`Agent health check complete: ${agents.length} agents, ${errorAgents.length} errors`);
    } catch (error) {
      this.logger.error('Agent health check failed', error);
    }
  }

  /**
   * 每5分钟检查风险指标
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async checkRiskIndicators() {
    if (!this.isEnabled) return;

    try {
      const riskAlerts = await this.hqService.getEngineRiskAlerts({ page: 1, limit: 100 });
      const openAlerts = riskAlerts.items.filter((a: any) => a.status === 'open');
      const criticalAlerts = openAlerts.filter((a: any) => a.severity === 'critical');

      if (criticalAlerts.length > 0) {
        this.hqService.addAlert(
          'risk',
          'Critical Risk Alert',
          `${criticalAlerts.length} critical risk alert(s) require immediate attention`,
        );
      }

      this.logger.debug(`Risk check complete: ${openAlerts.length} open alerts, ${criticalAlerts.length} critical`);
    } catch (error) {
      this.logger.error('Risk check failed', error);
    }
  }

  /**
   * 每小时生成业务摘要
   */
  @Cron(CronExpression.EVERY_HOUR)
  async generateHourlySummary() {
    if (!this.isEnabled) return;

    try {
      const stats = await this.hqService.getDashboardStats();
      const summary = `Hourly Summary: Revenue $${stats.revenue24h.toFixed(2)} (${(stats.revenueChange * 100).toFixed(1)}% change), ${stats.activeAgents}/${stats.totalAgents} agents active, Risk: ${stats.riskLevel}`;
      
      this.logger.log(summary);
      
      // Add as informational alert
      this.hqService.addAlert('biz', 'Hourly Summary', summary);
    } catch (error) {
      this.logger.error('Hourly summary generation failed', error);
    }
  }

  /**
   * 每天午夜执行日报任务
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async generateDailyReport() {
    if (!this.isEnabled) return;

    try {
      const stats = await this.hqService.getDashboardStats();
      const financeSummary = await this.hqService.getEngineFinanceSummary();

      const reportContent = `
Daily Report - ${new Date().toISOString().split('T')[0]}
═══════════════════════════════════════
Revenue: $${stats.revenue24h.toFixed(2)}
Net Amount: $${financeSummary.netAmount.toFixed(2)}
Active Merchants: ${stats.activeMerchants}
Active Agents: ${stats.activeAgents}/${stats.totalAgents}
System Health: ${stats.systemHealth}
Risk Level: ${stats.riskLevel}
═══════════════════════════════════════
      `.trim();

      this.logger.log(reportContent);
      
      // In production, this would send email/Slack notification
      this.hqService.addAlert('ops', 'Daily Report Generated', 'Daily business report has been generated and saved');
    } catch (error) {
      this.logger.error('Daily report generation failed', error);
    }
  }

  /**
   * 启用/禁用 Watchdog
   */
  setEnabled(enabled: boolean) {
    this.isEnabled = enabled;
    this.logger.log(`Watchdog ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * 获取 Watchdog 状态
   */
  getStatus() {
    return {
      enabled: this.isEnabled,
      timestamp: new Date().toISOString(),
    };
  }
}
