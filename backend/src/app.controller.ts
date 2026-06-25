import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { AppService } from './app.service';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@ApiTags('health')
@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    @InjectDataSource() private dataSource: DataSource,
  ) {}

  @Get()
  @ApiOperation({ summary: '健康检查' })
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('health')
  @ApiOperation({ summary: '服务健康状态' })
  getHealth() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: '2.2.0',
    };
  }

  @Get('api/health')
  @ApiOperation({ summary: '详细健康检查 (生产环境监控)' })
  async getDetailedHealth() {
    const checks: Record<string, { status: string; latency?: number; error?: string }> = {};
    
    // 数据库连接检查
    const dbStart = Date.now();
    try {
      await this.dataSource.query('SELECT 1');
      checks.database = { status: 'healthy', latency: Date.now() - dbStart };
    } catch (error) {
      checks.database = { status: 'unhealthy', error: error.message };
    }

    // 内存使用检查
    const memUsage = process.memoryUsage();
    const memUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
    const memTotalMB = Math.round(memUsage.heapTotal / 1024 / 1024);
    checks.memory = {
      status: memUsedMB < memTotalMB * 0.9 ? 'healthy' : 'warning',
      latency: memUsedMB,
    };

    // 总体状态
    const allHealthy = Object.values(checks).every(c => c.status === 'healthy');
    const hasWarning = Object.values(checks).some(c => c.status === 'warning');

    return {
      status: allHealthy ? 'healthy' : hasWarning ? 'degraded' : 'unhealthy',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '2.2.0',
      uptime: process.uptime(),
      checks,
      environment: process.env.NODE_ENV || 'development',
    };
  }

  @Get('api/ready')
  @ApiOperation({ summary: '就绪检查 (Kubernetes readiness probe)' })
  async getReadiness() {
    try {
      await this.dataSource.query('SELECT 1');
      return { status: 'ready' };
    } catch {
      return { status: 'not_ready' };
    }
  }

  @Get('api/live')
  @ApiOperation({ summary: '存活检查 (Kubernetes liveness probe)' })
  getLiveness() {
    return { status: 'alive', timestamp: new Date().toISOString() };
  }

  @Get('app/version')
  @ApiOperation({ summary: 'App version check (mobile update)' })
  getAppVersion() {
    return {
      latestVersion: '1.1.0',
      buildNumber: 70,
      apkUrl: 'https://api.agentrix.top/downloads/clawlink-agent.apk',
      minVersion: '1.0.0',
      forceUpdate: false,
      releaseNotes: 'Bug fixes, QR scan improvements, desktop AIO support',
      releasedAt: '2026-03-08',
    };
  }
}

