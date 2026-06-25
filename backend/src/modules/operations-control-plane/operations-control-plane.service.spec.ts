import { OperationsControlPlaneService } from './operations-control-plane.service';
import { DesktopCommandKind } from '../desktop-sync/dto/desktop-sync.dto';

function repo(items: any[] = []) {
  return {
    find: jest.fn().mockResolvedValue(items),
  } as any;
}

describe('OperationsControlPlaneService', () => {
  const recentDate = new Date();
  const oldDate = new Date(Date.now() - 10 * 60 * 1000);

  const toolControlPlaneService = {
    buildPolicyReport: jest.fn().mockReturnValue({
      status: 'pass',
      summary: {
        totalTools: 12,
        duplicateNameCount: 0,
        invalidNameCount: 0,
        highRiskToolCount: 1,
      },
      riskBands: { L0: 7, L1: 4, L2: 1 },
      recommendations: [],
    }),
  };

  it('aggregates runtime overview across lanes, repair, desktop sync, and tools', async () => {
    const service = new OperationsControlPlaneService(
      repo([{ status: 'running', updatedAt: recentDate }, { status: 'failed', updatedAt: recentDate }]),
      repo(),
      repo([{ status: 'completed', updatedAt: recentDate }]),
      repo([{ deviceId: 'desk-1', lastSeenAt: recentDate }, { deviceId: 'desk-2', lastSeenAt: oldDate }]),
      repo([{ sessionId: 'sess-1', updatedAt: recentDate }]),
      repo([{ status: 'executing', updatedAt: recentDate }]),
      repo([{ status: 'pending', createdAt: recentDate }]),
      repo([{ status: 'completed', updatedAt: recentDate }]),
      { createCommand: jest.fn() } as any,
      toolControlPlaneService as any,
    );

    const overview = await service.getOverview('user-1');

    expect(overview.status).toBe('warn');
    expect(overview.counts.laneJobs).toBe(2);
    expect(overview.counts.onlineDevices).toBe(1);
    expect(overview.counts.pendingApprovals).toBe(1);
    expect(overview.counts.runningTasks).toBe(1);
    expect(overview.toolPolicy.summary.totalTools).toBe(12);
  });

  it('builds wearable continuity summary from sessions, tasks, approvals, and devices', async () => {
    const service = new OperationsControlPlaneService(
      repo(),
      repo(),
      repo(),
      repo([{ deviceId: 'desk-1', platform: 'windows', appVersion: '1.0.0', lastSeenAt: recentDate, context: {} }]),
      repo([{ sessionId: 'sess-1', title: 'Desktop chat', messageCount: 2, deviceId: 'desk-1', deviceType: 'desktop', updatedAt: recentDate }]),
      repo([{ taskId: 'task-1', sessionId: 'sess-1', title: 'Run deploy check', status: 'executing', deviceId: 'desk-1', updatedAt: recentDate }]),
      repo([{ id: 'approval-1', taskId: 'task-1', title: 'Approve shell command', riskLevel: 'L2', status: 'pending', deviceId: 'desk-1', createdAt: recentDate }]),
      repo(),
      { createCommand: jest.fn() } as any,
      toolControlPlaneService as any,
    );

    const continuity = await service.getContinuity('user-1');

    expect(continuity.sessions[0].activeTaskCount).toBe(1);
    expect(continuity.sessions[0].pendingApprovalCount).toBe(1);
    expect(continuity.wearableSummary.onlineDeviceCount).toBe(1);
    expect(continuity.wearableSummary.topItems[0]).toMatchObject({ kind: 'approval', title: 'Approve shell command' });
  });

  it('queues cross-device follow-up as a desktop context command', async () => {
    const createCommand = jest.fn().mockResolvedValue({ command: { id: 'cmd-1', kind: DesktopCommandKind.CONTEXT } });
    const service = new OperationsControlPlaneService(
      repo(),
      repo(),
      repo(),
      repo(),
      repo(),
      repo(),
      repo(),
      repo(),
      { createCommand } as any,
      toolControlPlaneService as any,
    );

    const result = await service.createFollowUp('user-1', {
      sessionId: 'sess-1',
      targetDeviceId: 'desk-1',
      requesterDeviceId: 'mobile-1',
      action: 'resume-on-desktop',
    });

    expect(result.ok).toBe(true);
    expect((result.followUp.command as any).id).toBe('cmd-1');
    expect(createCommand).toHaveBeenCalledWith('user-1', expect.objectContaining({
      kind: DesktopCommandKind.CONTEXT,
      targetDeviceId: 'desk-1',
      requesterDeviceId: 'mobile-1',
      sessionId: 'sess-1',
    }));
  });
});