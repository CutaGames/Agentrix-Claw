import { BadRequestException } from '@nestjs/common';
import { PetAutoEarnService } from './pet-auto-earn.service';
import { TaskStatus, TaskVisibility } from '../../entities/merchant-task.entity';
import { BidStatus } from '../../entities/task-bid.entity';

const USER = 'user-1';

function makeDeps() {
  const tasks = { find: jest.fn(), findOne: jest.fn() } as any;
  const bids = { findOne: jest.fn(), create: jest.fn((o: any) => ({ ...o })), save: jest.fn(async (o: any) => ({ ...o, id: 'bid-1' })) } as any;
  const accounts = { findOne: jest.fn() } as any;
  const economic = { ensureEarningCapability: jest.fn(async () => ({ ok: true, boundAgentAccountId: 'agt-1', alreadyBound: true })) } as any;
  const svc = new PetAutoEarnService(tasks, bids, accounts, economic);
  return { svc, tasks, bids, accounts, economic };
}

describe('PetAutoEarnService (需求 6 半自主接活)', () => {
  it('listOpportunities 排除自己发布的任务并映射', async () => {
    const { svc, tasks } = makeDeps();
    tasks.find.mockResolvedValue([
      { id: 't1', userId: 'other', title: 'A', type: 'data', budget: 100, currency: 'USD', tags: ['x'] },
      { id: 't2', userId: USER, title: 'mine', type: 'data', budget: 200, currency: 'USD', tags: [] },
    ]);
    const ops = await svc.listOpportunities(USER);
    expect(ops).toHaveLength(1);
    expect(ops[0].taskId).toBe('t1');
    expect(ops[0].budget).toBe(100);
  });

  it('acceptOpportunity 成功代投标（接入真实 TaskBid）', async () => {
    const { svc, tasks, bids, accounts } = makeDeps();
    accounts.findOne.mockResolvedValue({ id: 'agt-1', spendingLimits: { singleTxLimit: 1000 } });
    tasks.findOne.mockResolvedValue({ id: 't1', userId: 'other', title: 'A', budget: 100, currency: 'USD', status: TaskStatus.PENDING, visibility: TaskVisibility.PUBLIC });
    bids.findOne.mockResolvedValue(null);
    const r = await svc.acceptOpportunity(USER, 't1');
    expect(r.ok).toBe(true);
    expect(r.bidId).toBe('bid-1');
    expect(bids.save).toHaveBeenCalled();
    const saved = bids.create.mock.calls[0][0];
    expect(saved).toMatchObject({ taskId: 't1', bidderId: USER, proposedBudget: 100, status: BidStatus.PENDING });
  });

  it('限额围栏：任务预算超单笔上限则拒（Property 6）', async () => {
    const { svc, tasks, accounts } = makeDeps();
    accounts.findOne.mockResolvedValue({ id: 'agt-1', spendingLimits: { singleTxLimit: 50 } });
    tasks.findOne.mockResolvedValue({ id: 't1', userId: 'other', title: 'A', budget: 100, currency: 'USD', status: TaskStatus.PENDING, visibility: TaskVisibility.PUBLIC });
    await expect(svc.acceptOpportunity(USER, 't1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('已有待处理投标则幂等返回，不重复投标', async () => {
    const { svc, tasks, bids, accounts } = makeDeps();
    accounts.findOne.mockResolvedValue({ id: 'agt-1', spendingLimits: { singleTxLimit: 1000 } });
    tasks.findOne.mockResolvedValue({ id: 't1', userId: 'other', budget: 100, currency: 'USD', status: TaskStatus.PENDING, visibility: TaskVisibility.PUBLIC });
    bids.findOne.mockResolvedValue({ id: 'existing-bid', proposedBudget: 100 });
    const r = await svc.acceptOpportunity(USER, 't1');
    expect(r.bidId).toBe('existing-bid');
    expect(bids.save).not.toHaveBeenCalled();
  });

  it('不能接自己发布的任务', async () => {
    const { svc, tasks, accounts } = makeDeps();
    accounts.findOne.mockResolvedValue({ id: 'agt-1', spendingLimits: { singleTxLimit: 1000 } });
    tasks.findOne.mockResolvedValue({ id: 't1', userId: USER, budget: 100, status: TaskStatus.PENDING, visibility: TaskVisibility.PUBLIC });
    await expect(svc.acceptOpportunity(USER, 't1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('任务非 PENDING 则拒', async () => {
    const { svc, tasks, accounts } = makeDeps();
    accounts.findOne.mockResolvedValue({ id: 'agt-1', spendingLimits: { singleTxLimit: 1000 } });
    tasks.findOne.mockResolvedValue({ id: 't1', userId: 'other', budget: 100, status: TaskStatus.COMPLETED, visibility: TaskVisibility.PUBLIC });
    await expect(svc.acceptOpportunity(USER, 't1')).rejects.toBeInstanceOf(BadRequestException);
  });
});
