import {
  validateQuestConfig,
  detectSuspiciousClusters,
  screenParticipantSybil,
  buildQuestVerificationReport,
  dedupSubmissions,
  rewardDispositionIsProjectOwnerDecision,
  DEFAULT_SYBIL_THRESHOLDS,
  NOT_COLLECTED,
  isNotCollected,
  type QuestConfig,
  type ParticipantSubmission,
  type SybilThresholds,
} from './quest-verification';

/**
 * Quest / 活动核验纯函数单测(任务 19.4 / 需求 14.16–14.19)。
 *
 * 覆盖:
 *   - 活动配置校验(14.16 防错误条件):缺目标/空清单/无必做/重复 id。
 *   - 反 sybil 只读标记(14.18 / 15.2):评分 + 可疑簇 + 依据;缺数据不编造信号。
 *   - 活动核验报告(14.17):合格=完成必做∧过 sybil 的唯一参与者;完成率;被排除依据。
 *   - 不自动处置奖励发放(14.18):报告仅标记被排除者,不含发放/扣发。
 */
describe('quest-verification 纯函数(任务 19.4 / 需求 14.16–14.19)', () => {
  const config: QuestConfig = {
    objective: '提升 testnet 活跃',
    tasks: [
      { id: 'follow_x', label: '关注 X', mandatory: true },
      { id: 'join_tg', label: '加入 TG', mandatory: true },
      { id: 'bonus_quiz', label: '附加测验', mandatory: false },
    ],
  };

  // ───────────────────── 配置校验(14.16) ─────────────────────

  describe('validateQuestConfig', () => {
    it('有效配置 → ok=true,识别必做任务', () => {
      const res = validateQuestConfig(config);
      expect(res.ok).toBe(true);
      expect(res.errors).toHaveLength(0);
      expect(res.mandatoryTaskIds).toEqual(['follow_x', 'join_tg']);
    });

    it('缺活动目标 → missing_objective', () => {
      const res = validateQuestConfig({ ...config, objective: '   ' });
      expect(res.ok).toBe(false);
      expect(res.errors).toContain('missing_objective');
    });

    it('任务清单为空 → empty_task_list + no_mandatory_task', () => {
      const res = validateQuestConfig({ objective: 'x', tasks: [] });
      expect(res.ok).toBe(false);
      expect(res.errors).toContain('empty_task_list');
    });

    it('全部任务可选(无必做)→ no_mandatory_task', () => {
      const res = validateQuestConfig({
        objective: 'x',
        tasks: [{ id: 't1', label: '可选', mandatory: false }],
      });
      expect(res.ok).toBe(false);
      expect(res.errors).toContain('no_mandatory_task');
    });

    it('重复任务 id → duplicate_task_id', () => {
      const res = validateQuestConfig({
        objective: 'x',
        tasks: [
          { id: 'dup', label: 'a', mandatory: true },
          { id: 'dup', label: 'b', mandatory: false },
        ],
      });
      expect(res.ok).toBe(false);
      expect(res.errors).toContain('duplicate_task_id');
    });
  });

  // ───────────────────── 反 sybil 只读(14.18 / 15.2) ─────────────────────

  describe('detectSuspiciousClusters', () => {
    it('共享资金来源 ≥ minClusterSize → 可疑簇', () => {
      const clusters = detectSuspiciousClusters(
        [
          { address: '0xA', funderAddress: '0xF' },
          { address: '0xB', funderAddress: '0xF' },
          { address: '0xC', funderAddress: '0xF' },
          { address: '0xD', funderAddress: '0xOther' },
        ],
        3,
      );
      expect(clusters).toHaveLength(1);
      expect(clusters[0].funderAddress).toBe('0xf');
      expect(clusters[0].members).toEqual(['0xa', '0xb', '0xc']);
    });

    it('缺资金来源不并入任何簇(不编造关联)', () => {
      const clusters = detectSuspiciousClusters(
        [
          { address: '0xA', funderAddress: null },
          { address: '0xB', funderAddress: undefined },
        ],
        2,
      );
      expect(clusters).toHaveLength(0);
    });
  });

  describe('screenParticipantSybil', () => {
    const thresholds: SybilThresholds = {
      minTxCount: 5,
      minWalletAgeDays: 7,
      minDistinctCounterparties: 3,
      minClusterSize: 3,
      riskScoreThreshold: 50,
    };

    it('低活跃 + 新钱包 + 单一交互 → 命中信号并计分', () => {
      const res = screenParticipantSybil(
        {
          address: '0xA',
          txCount: 1,
          walletAgeDays: 2,
          distinctCounterparties: 1,
        },
        thresholds,
      );
      expect(res.signals).toEqual(
        expect.arrayContaining([
          'low_onchain_activity',
          'new_wallet',
          'single_counterparty_pattern',
        ]),
      );
      // 25 + 15 + 10 = 50 ≥ 阈值 → 标记
      expect(res.riskScore).toBe(50);
      expect(res.flaggedSybil).toBe(true);
    });

    it('落入可疑簇 → 单独即可超阈值标记(权重 50)', () => {
      const res = screenParticipantSybil(
        { address: '0xA' },
        thresholds,
        '0xf',
      );
      expect(res.signals).toContain('shared_funding_cluster');
      expect(res.clusterId).toBe('0xf');
      expect(res.flaggedSybil).toBe(true);
    });

    it('缺链上数据 → 不编造信号,评分 0 不标记', () => {
      const res = screenParticipantSybil({ address: '0xA' }, thresholds);
      expect(res.signals).toHaveLength(0);
      expect(res.riskScore).toBe(0);
      expect(res.flaggedSybil).toBe(false);
    });

    it('活跃健康钱包 → 不标记', () => {
      const res = screenParticipantSybil(
        {
          address: '0xA',
          txCount: 100,
          walletAgeDays: 365,
          distinctCounterparties: 30,
        },
        thresholds,
      );
      expect(res.flaggedSybil).toBe(false);
      expect(res.riskScore).toBe(0);
    });
  });

  // ───────────────────── 活动核验报告(14.17) ─────────────────────

  describe('buildQuestVerificationReport', () => {
    it('合格 = 完成全部必做任务 ∧ 过反 sybil 的唯一参与者', () => {
      const submissions: ParticipantSubmission[] = [
        {
          address: '0xGood',
          completedTaskIds: ['follow_x', 'join_tg', 'bonus_quiz'],
          onchain: {
            address: '0xGood',
            txCount: 50,
            walletAgeDays: 100,
            distinctCounterparties: 10,
          },
        },
        {
          // 缺一个必做任务 → 排除
          address: '0xMissing',
          completedTaskIds: ['follow_x'],
          onchain: {
            address: '0xMissing',
            txCount: 50,
            walletAgeDays: 100,
            distinctCounterparties: 10,
          },
        },
        {
          // 完成必做但 sybil 标记(新钱包+低活跃+单一交互)→ 排除
          address: '0xSybil',
          completedTaskIds: ['follow_x', 'join_tg'],
          onchain: {
            address: '0xSybil',
            txCount: 0,
            walletAgeDays: 1,
            distinctCounterparties: 0,
          },
        },
      ];

      const report = buildQuestVerificationReport(config, submissions);
      expect(report.totalParticipants).toBe(3);
      expect(report.qualifiedCount).toBe(1);
      expect(report.qualified[0].identifier).toBe('0xgood');
      expect(report.excluded).toHaveLength(2);

      const missing = report.excluded.find((e) => e.identifier === '0xmissing');
      expect(missing?.exclusionReasons).toContain('incomplete_mandatory_tasks');
      expect(missing?.missingMandatoryTaskIds).toEqual(['join_tg']);

      const sybil = report.excluded.find((e) => e.identifier === '0xsybil');
      expect(sybil?.exclusionReasons).toContain('sybil_flagged');

      // 完成率 = 1/3 = 33.33%
      expect(report.completionRatePercent).toBe(33.33);
    });

    it('按唯一地址去重(同地址多次提交只计一次)', () => {
      const submissions: ParticipantSubmission[] = [
        { address: '0xDup', completedTaskIds: ['follow_x', 'join_tg'] },
        { address: '0xDUP', completedTaskIds: ['follow_x', 'join_tg'] },
      ];
      const report = buildQuestVerificationReport(config, submissions);
      expect(report.totalParticipants).toBe(1);
      expect(report.duplicatesRemoved).toBe(1);
    });

    it('总参与者为 0 → 完成率「未获取」(不编造,Property 7)', () => {
      const report = buildQuestVerificationReport(config, []);
      expect(report.totalParticipants).toBe(0);
      expect(isNotCollected(report.completionRatePercent)).toBe(true);
      expect(report.completionRatePercent).toBe(NOT_COLLECTED);
    });

    it('识别共享资金来源可疑簇并据以标记成员(只读,不处置)', () => {
      const subs: ParticipantSubmission[] = ['0x1', '0x2', '0x3'].map((a) => ({
        address: a,
        completedTaskIds: ['follow_x', 'join_tg'],
        onchain: {
          address: a,
          funderAddress: '0xFarm',
          txCount: 100,
          walletAgeDays: 365,
          distinctCounterparties: 50,
        },
      }));
      const report = buildQuestVerificationReport(config, subs);
      expect(report.suspiciousClusters).toHaveLength(1);
      // 全部因落入可疑簇被标记排除(仅标记,不处置奖励)
      expect(report.qualifiedCount).toBe(0);
      expect(
        report.excluded.every((e) =>
          e.exclusionReasons.includes('sybil_flagged'),
        ),
      ).toBe(true);
    });

    it('奖励处置恒由项目方决定(14.18)', () => {
      expect(rewardDispositionIsProjectOwnerDecision).toBe(true);
    });
  });

  describe('dedupSubmissions', () => {
    it('空地址条目原样保留(无唯一标识不去重)', () => {
      const { unique, duplicatesRemoved } = dedupSubmissions([
        { address: '', completedTaskIds: [] },
        { address: '', completedTaskIds: [] },
      ]);
      expect(unique).toHaveLength(2);
      expect(duplicatesRemoved).toBe(0);
    });
  });

  it('DEFAULT_SYBIL_THRESHOLDS 为保守基线', () => {
    expect(DEFAULT_SYBIL_THRESHOLDS.riskScoreThreshold).toBe(50);
    expect(DEFAULT_SYBIL_THRESHOLDS.minClusterSize).toBe(3);
  });
});
