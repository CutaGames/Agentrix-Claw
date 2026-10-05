/**
 * externalFacts — Soul_Birth 外部事实拉取的单元测试。
 *
 * spec:   .kiro/specs/soul-companion-onboarding/{requirements,design}.md
 * design: §2.1 / §2.2 / §6,Correctness Property 1(主线必达)、Property 5(较后已达成则跳过)
 *
 * 重点验证 **Property 1**:任一来源(getMyInstances / getRelayStatus / listMyPlots)失败
 * 时对应事实回退 false 且整体不抛出、不阻塞;以及事实到三步的正确映射。
 *
 * 放在 `src/services/__tests__/` 以匹配 jest.config 的 testMatch;通过 mock 两个 service
 * 模块隔离 react-native / api 依赖。
 *
 * 注:Windows 检出 node_modules 为桩,本地不跑 jest;真实门禁走 WSL/CI。
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const getMyInstances = jest.fn() as jest.MockedFunction<() => Promise<any[]>>;
const getRelayStatus = jest.fn() as jest.MockedFunction<
  (id: string) => Promise<{ connected: boolean; instanceId: string }>
>;
const listMyPlots = jest.fn() as jest.MockedFunction<() => Promise<any[]>>;

jest.mock('../openclaw.service', () => ({
  getMyInstances: () => getMyInstances(),
  getRelayStatus: (id: string) => getRelayStatus(id),
}));

jest.mock('../aeon/aeonApi', () => ({
  listMyPlots: () => listMyPlots(),
}));

import { fetchExternalFacts } from '../../components/onboarding/externalFacts';

describe('fetchExternalFacts — 事实映射', () => {
  beforeEach(() => {
    getMyInstances.mockReset();
    getRelayStatus.mockReset();
    listMyPlots.mockReset();
  });

  it('有实例 + 有地块(非 local 实例)→ hasInstance/hasClaimedPlot 真,desktopPairedBefore 假', async () => {
    getMyInstances.mockResolvedValueOnce([{ id: 'i1', deployType: 'cloud' }]);
    listMyPlots.mockResolvedValueOnce([{ id: 'p1' }]);

    const facts = await fetchExternalFacts();

    expect(facts).toEqual({
      hasInstance: true,
      desktopPairedBefore: false,
      hasClaimedPlot: true,
    });
    // cloud 实例无 relay 信号、非 local → 不应调用 relay-status
    expect(getRelayStatus).not.toHaveBeenCalled();
  });

  it('空实例 + 无地块 → 全部 false,且不查 relay-status', async () => {
    getMyInstances.mockResolvedValueOnce([]);
    listMyPlots.mockResolvedValueOnce([]);

    const facts = await fetchExternalFacts();

    expect(facts).toEqual({
      hasInstance: false,
      desktopPairedBefore: false,
      hasClaimedPlot: false,
    });
    expect(getRelayStatus).not.toHaveBeenCalled();
  });

  it('实例带 relayConnected 强信号 → desktopPairedBefore 真,不必再查 relay-status', async () => {
    getMyInstances.mockResolvedValueOnce([{ id: 'i1', deployType: 'cloud', relayConnected: true }]);
    listMyPlots.mockResolvedValueOnce([]);

    const facts = await fetchExternalFacts();

    expect(facts.desktopPairedBefore).toBe(true);
    expect(getRelayStatus).not.toHaveBeenCalled();
  });

  it('实例带 relayToken → desktopPairedBefore 真', async () => {
    getMyInstances.mockResolvedValueOnce([{ id: 'i1', deployType: 'cloud', relayToken: 'tok' }]);
    listMyPlots.mockResolvedValueOnce([]);

    const facts = await fetchExternalFacts();

    expect(facts.desktopPairedBefore).toBe(true);
  });

  it('local 实例无 relay 标记但 relay-status.connected → desktopPairedBefore 真', async () => {
    getMyInstances.mockResolvedValueOnce([{ id: 'i1', deployType: 'local' }]);
    getRelayStatus.mockResolvedValueOnce({ connected: true, instanceId: 'i1' });
    listMyPlots.mockResolvedValueOnce([]);

    const facts = await fetchExternalFacts();

    expect(facts.desktopPairedBefore).toBe(true);
    expect(getRelayStatus).toHaveBeenCalledWith('i1');
  });
});

describe('fetchExternalFacts — 主线必达 / 失败回退(Property 1)', () => {
  beforeEach(() => {
    getMyInstances.mockReset();
    getRelayStatus.mockReset();
    listMyPlots.mockReset();
  });

  it('getMyInstances 失败 → 实例相关事实 false,但不阻塞 hasClaimedPlot 计算', async () => {
    getMyInstances.mockRejectedValueOnce(new Error('network down'));
    listMyPlots.mockResolvedValueOnce([{ id: 'p1' }]);

    const facts = await fetchExternalFacts();

    expect(facts).toEqual({
      hasInstance: false,
      desktopPairedBefore: false,
      hasClaimedPlot: true,
    });
  });

  it('listMyPlots 失败 → hasClaimedPlot false,但不影响实例相关事实', async () => {
    getMyInstances.mockResolvedValueOnce([{ id: 'i1', deployType: 'cloud', relayConnected: true }]);
    listMyPlots.mockRejectedValueOnce(new Error('aeon 500'));

    const facts = await fetchExternalFacts();

    expect(facts).toEqual({
      hasInstance: true,
      desktopPairedBefore: true,
      hasClaimedPlot: false,
    });
  });

  it('local 实例 + relay-status 失败 → 回退到「存在本地实例即视为配对过」', async () => {
    getMyInstances.mockResolvedValueOnce([{ id: 'i1', deployType: 'local' }]);
    getRelayStatus.mockRejectedValueOnce(new Error('relay timeout'));
    listMyPlots.mockResolvedValueOnce([]);

    const facts = await fetchExternalFacts();

    expect(facts.desktopPairedBefore).toBe(true);
  });

  it('所有来源全部失败 → 三事实皆 false 且整体不抛出', async () => {
    getMyInstances.mockRejectedValueOnce(new Error('x'));
    listMyPlots.mockRejectedValueOnce(new Error('y'));

    await expect(fetchExternalFacts()).resolves.toEqual({
      hasInstance: false,
      desktopPairedBefore: false,
      hasClaimedPlot: false,
    });
  });
});
