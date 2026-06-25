import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PolicyEvaluatorService, ActionDescriptor } from './policy-evaluator.service';
import { Authorization } from '../../entities/authorization.entity';
import { Policy } from '../../entities/policy.entity';
import { Payment } from '../../entities/payment.entity';
import { Order } from '../../entities/order.entity';
import {
  checkRedline,
  enforceNoPrivEscalation,
  enforceWindowAllowed,
  enforceNoAbuse,
  BLOCKED_PROCESSES,
} from './redlines';

describe('PolicyEvaluatorService — 风险分级与红线 (需求 3 / 6.2)', () => {
  let service: PolicyEvaluatorService;

  const mockRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PolicyEvaluatorService,
        { provide: getRepositoryToken(Authorization), useValue: mockRepo },
        { provide: getRepositoryToken(Policy), useValue: mockRepo },
        { provide: getRepositoryToken(Payment), useValue: mockRepo },
        { provide: getRepositoryToken(Order), useValue: mockRepo },
      ],
    }).compile();

    service = module.get<PolicyEvaluatorService>(PolicyEvaluatorService);
  });

  describe('classifyActionRisk — 各级判定', () => {
    it('只读动作 → read（自动）', () => {
      for (const type of ['screenshot', 'navigate', 'browser_eval_read', 'read_selector', 'window_tree', 'focus_window', 'scroll']) {
        expect(service.classifyActionRisk({ type }).tier).toBe('read');
      }
    });

    it('中风险动作 → medium（策略+预算）', () => {
      for (const type of ['click', 'type', 'input', 'submit_form', 'navigate_new_domain', 'publish', 'browser_click_selector']) {
        expect(service.classifyActionRisk({ type }).tier).toBe('medium');
      }
    });

    it('导航新域 → medium', () => {
      expect(service.classifyActionRisk({ type: 'navigate', toExternalDomain: true }).tier).toBe('medium');
      // 同域导航仍为只读
      expect(service.classifyActionRisk({ type: 'navigate', toExternalDomain: false }).tier).toBe('read');
    });

    it('高风险动作 → high（人确认）', () => {
      for (const type of ['transaction_sign', 'transfer', 'new_payee_address', 'external_publish', 'batch_operation', 'irreversible_submit']) {
        expect(service.classifyActionRisk({ type }).tier).toBe('high');
      }
    });

    it('批量操作升级为 high', () => {
      expect(service.classifyActionRisk({ type: 'click', isBatch: true }).tier).toBe('high');
    });

    it('红线动作类型 → redline', () => {
      for (const type of ['terminal', 'shell_exec', 'sudo', 'sybil', 'wash_trading', 'buy_followers']) {
        const r = service.classifyActionRisk({ type });
        expect(r.tier).toBe('redline');
        expect(r.redline).toBe(true);
      }
    });

    it('终端目标进程 → redline', () => {
      expect(service.classifyActionRisk({ type: 'click', targetApp: 'cmd.exe' }).tier).toBe('redline');
      expect(service.classifyActionRisk({ type: 'click', targetApp: 'agentrix-desktop.exe' }).tier).toBe('redline');
    });

    it('提权输入文本 → redline', () => {
      expect(service.classifyActionRisk({ type: 'type', inputText: 'sudo apt update' }).tier).toBe('redline');
      expect(service.classifyActionRisk({ type: 'type', inputText: 'rm -rf / now' }).tier).toBe('redline');
    });

    it('合规滥用意图 → redline', () => {
      expect(service.classifyActionRisk({ type: 'navigate', intent: '帮我多钱包薅空投' }).tier).toBe('redline');
      expect(service.classifyActionRisk({ type: 'click', intent: 'do some wash trading' }).tier).toBe('redline');
      expect(service.classifyActionRisk({ type: 'publish', intent: '帮我买粉刷互动' }).tier).toBe('redline');
    });

    it('未知动作类型 → 默认 high（安全优先）', () => {
      expect(service.classifyActionRisk({ type: 'some_unknown_action' }).tier).toBe('high');
    });
  });

  describe('evaluateActionRisk — 分级放行', () => {
    it('read → auto_execute', async () => {
      const r = await service.evaluateActionRisk({ type: 'screenshot' });
      expect(r.suggestedAction).toBe('auto_execute');
    });

    it('high → user_confirmation', async () => {
      const r = await service.evaluateActionRisk({ type: 'transfer' });
      expect(r.suggestedAction).toBe('user_confirmation');
    });

    it('medium 无预算上下文 → user_confirmation', async () => {
      const r = await service.evaluateActionRisk({ type: 'publish' });
      expect(r.tier).toBe('medium');
      expect(r.suggestedAction).toBe('user_confirmation');
    });

    it('medium + 预算授权通过 → auto_execute', async () => {
      const spy = jest.spyOn(service, 'evaluatePolicy').mockResolvedValue({
        authorized: true,
        suggestedAction: 'auto_execute',
        evaluationDetails: {},
      } as any);

      const action: ActionDescriptor = {
        type: 'publish',
        budget: { userId: 'u1', agentId: 'a1', amount: 10, merchantId: 'm1' },
      };
      const r = await service.evaluateActionRisk(action);
      expect(spy).toHaveBeenCalled();
      expect(r.suggestedAction).toBe('auto_execute');
    });

    it('medium + 预算不通过 → 回落 user_confirmation', async () => {
      jest.spyOn(service, 'evaluatePolicy').mockResolvedValue({
        authorized: false,
        reason: 'EXCEEDS_DAILY_LIMIT',
        suggestedAction: 'user_confirmation',
        evaluationDetails: {},
      } as any);

      const action: ActionDescriptor = {
        type: 'click',
        budget: { userId: 'u1', agentId: 'a1', amount: 9999, merchantId: 'm1' },
      };
      const r = await service.evaluateActionRisk(action);
      expect(r.suggestedAction).toBe('user_confirmation');
      expect(r.reason).toBe('EXCEEDS_DAILY_LIMIT');
    });
  });

  describe('Property 3 — 红线不可绕过（任何策略/预算下被拒）', () => {
    it('redline → deny，且不咨询任何策略/授权（不可绕过）', async () => {
      // 即便策略会授权一切,红线仍先于策略被拒,evaluatePolicy 永不被调用
      const policySpy = jest.spyOn(service, 'evaluatePolicy').mockResolvedValue({
        authorized: true,
        suggestedAction: 'auto_execute',
        evaluationDetails: {},
      } as any);

      const redlineActions: ActionDescriptor[] = [
        { type: 'terminal' },
        { type: 'wash_trading', budget: { userId: 'u1', agentId: 'a1', amount: 1, merchantId: 'm1' } },
        { type: 'type', targetApp: 'powershell.exe' },
        { type: 'type', inputText: 'sudo rm something' },
        { type: 'publish', intent: '帮我 sybil 薅空投', budget: { userId: 'u1', agentId: 'a1', amount: 1, merchantId: 'm1' } },
        { type: 'click', intent: '买粉刷量', budget: { userId: 'u1', agentId: 'a1', amount: 1, merchantId: 'm1' } },
      ];

      for (const action of redlineActions) {
        const r = await service.evaluateActionRisk(action);
        expect(r.tier).toBe('redline');
        expect(r.redline).toBe(true);
        expect(r.suggestedAction).toBe('deny');
      }
      expect(policySpy).not.toHaveBeenCalled();
    });
  });

  describe('后端红线与 Rust redlines.rs 对齐', () => {
    it('BLOCKED_PROCESSES 覆盖终端与自身进程', () => {
      expect(BLOCKED_PROCESSES).toEqual(expect.arrayContaining(['cmd.exe', 'powershell.exe', 'pwsh.exe', 'Terminal.app', 'agentrix-desktop.exe']));
    });

    it('enforceWindowAllowed 拦截终端、放行正常应用', () => {
      expect(enforceWindowAllowed('cmd.exe').ok).toBe(false);
      expect(enforceWindowAllowed('PowerShell.exe').ok).toBe(false);
      expect(enforceWindowAllowed('Terminal.app').ok).toBe(false);
      expect(enforceWindowAllowed('agentrix-desktop.exe').ok).toBe(false);
      expect(enforceWindowAllowed('chrome.exe').ok).toBe(true);
      expect(enforceWindowAllowed('Notepad').ok).toBe(true);
    });

    it('enforceNoPrivEscalation 拦截提权、放行正常文本', () => {
      expect(enforceNoPrivEscalation('hello sudo apt update').ok).toBe(false);
      expect(enforceNoPrivEscalation('rm -rf / now').ok).toBe(false);
      expect(enforceNoPrivEscalation('请帮我总结文档').ok).toBe(true);
      expect(enforceNoPrivEscalation('买一杯咖啡').ok).toBe(true);
    });

    it('enforceNoAbuse 拦截 sybil/wash trading/买粉', () => {
      expect(enforceNoAbuse('多钱包薅空投').ok).toBe(false);
      expect(enforceNoAbuse('wash trading on dex').ok).toBe(false);
      expect(enforceNoAbuse('买粉').ok).toBe(false);
      expect(enforceNoAbuse('正常的社区运营周报').ok).toBe(true);
    });

    it('checkRedline 综合检查', () => {
      expect(checkRedline({ type: 'click', targetApp: 'wt.exe' }).ok).toBe(false);
      expect(checkRedline({ type: 'type', inputText: 'diskpart' }).ok).toBe(false);
      expect(checkRedline({ type: 'navigate', intent: '正常浏览区块浏览器' }).ok).toBe(true);
    });
  });
});
