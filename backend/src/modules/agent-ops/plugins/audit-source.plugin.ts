import { Inject, Injectable } from '@nestjs/common';

import { BaseDataSourcePlugin } from './base-data-source.plugin';
import { isEvmAddress } from './chain-explorers';
import {
  DueDiligenceTarget,
  READ_ONLY_FETCHER,
  ReadOnlyFetcher,
} from '../data-source-plugin.types';

/** 项目 slug 规范化(去协议头 / 去尾斜杠 / 小写)。 */
function projectSlug(target: DueDiligenceTarget): string | null {
  const raw = (target.project ?? target.name ?? '').trim();
  if (!raw) return null;
  const cleaned = raw
    .replace(/^https?:\/\//i, '')
    .replace(/\/+$/, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return cleaned || null;
}

/**
 * AuditSourcePlugin — 官方/审计只读数据源(De.Fi Scanner 系审计注册表)。
 *
 * spec: .kiro/specs/crypto-native-agent-ops/{requirements,design}.md
 *   - design §C4「采集插件」首批之一(1 个官方/审计源)。
 *   - 需求 8 验收清单 A.4(审计状态)/ A.5(审计报告链接)。
 *
 * 处理 project / token / contract:优先用 EVM 地址查审计扫描器,否则用项目 slug;
 * 采集审计状态 / 报告链接等**可核字段**;只读;失败/缺数据 → 标「未获取」(基类兜底,不编造)。
 */
@Injectable()
export class AuditSourcePlugin extends BaseDataSourcePlugin {
  readonly name = 'audit_source';

  constructor(@Inject(READ_ONLY_FETCHER) fetcher: ReadOnlyFetcher) {
    super(fetcher);
  }

  supports(target: DueDiligenceTarget): boolean {
    if (!['project', 'token', 'contract'].includes(target.type)) return false;
    return isEvmAddress(target.address) || projectSlug(target) != null;
  }

  sourceUrl(target: DueDiligenceTarget): string {
    if (isEvmAddress(target.address)) {
      return `https://de.fi/scanner/contract/${target.address!.trim()}`;
    }
    const slug = projectSlug(target);
    return slug ? `https://de.fi/project/${slug}` : '';
  }

  protected buildExtractExpression(): string {
    // 只读 DOM 提取(示意):读取审计状态 / 审计报告链接。
    return `(() => {
      const txt = (sel) => { const el = document.querySelector(sel); return el ? el.textContent.trim() : null; };
      const href = (sel) => { const el = document.querySelector(sel); return el ? el.getAttribute('href') : null; };
      return {
        auditStatusText: txt('[data-testid="audit-status"], .audit-status'),
        auditReportUrl: href('a[data-testid="audit-report-link"], a.audit-report'),
      };
    })()`;
  }

  protected normalize(
    raw: any,
    _target: DueDiligenceTarget,
  ): Record<string, any> | null {
    if (raw == null || typeof raw !== 'object') return null;

    const out: Record<string, any> = {};

    if (typeof raw.auditStatusText === 'string' && raw.auditStatusText.trim()) {
      out.auditStatus = raw.auditStatusText.trim();
    }
    if (typeof raw.auditReportUrl === 'string' && /^https?:\/\//i.test(raw.auditReportUrl)) {
      out.auditReportUrl = raw.auditReportUrl.trim();
    }

    return Object.keys(out).length ? out : null;
  }
}
