import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { ProtocolController } from './protocol.controller';
import { ProtocolService } from './protocol.service';
import { AcpBridgeService } from './acp-bridge.service';

describe('ProtocolController', () => {
  let controller: ProtocolController;

  const createSession = jest.fn<(...args: any[]) => Promise<any>>();
  const loadSession = jest.fn<(...args: any[]) => Promise<any>>();
  const getSessionStatus = jest.fn<(...args: any[]) => Promise<any>>();
  const steerSession = jest.fn<(...args: any[]) => Promise<any>>();
  const killSession = jest.fn<(...args: any[]) => Promise<any>>();
  const listSessions = jest.fn<(...args: any[]) => Promise<any>>();
  const replyDispatch = jest.fn<(...args: any[]) => Promise<any>>();
  const listActions = jest.fn<(...args: any[]) => Promise<any>>();
  const invokeAction = jest.fn<(...args: any[]) => Promise<any>>();

  const mockProtocolService = {};
  const mockAcpBridgeService = {
    createSession,
    loadSession,
    getSessionStatus,
    steerSession,
    killSession,
    listSessions,
    replyDispatch,
    listActions,
    invokeAction,
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProtocolController],
      providers: [
        { provide: ProtocolService, useValue: mockProtocolService },
        { provide: AcpBridgeService, useValue: mockAcpBridgeService },
      ],
    }).compile();

    controller = module.get<ProtocolController>(ProtocolController);
  });

  it('prefers authenticated user for ACP session creation', async () => {
    mockAcpBridgeService.createSession.mockResolvedValue({ sessionId: 'acp-1' });

    await controller.createAcpSession(
      { user: { id: 'jwt-user' } },
      { userId: 'legacy-user', agentId: 'agent-1' },
    );

    expect(mockAcpBridgeService.createSession).toHaveBeenCalledWith('jwt-user', 'agent-1', undefined);
  });

  it('falls back to legacy userId when auth user is absent', async () => {
    mockAcpBridgeService.listSessions.mockResolvedValue([]);

    await controller.listAcpSessions({}, 'legacy-user');

    expect(mockAcpBridgeService.listSessions).toHaveBeenCalledWith('legacy-user');
  });

  it('rejects ACP session creation when no user context is available', async () => {
    await expect(
      controller.createAcpSession({}, { agentId: 'agent-1' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('scopes ACP session reads to the authenticated user when present', async () => {
    mockAcpBridgeService.loadSession.mockResolvedValue({ sessionId: 'acp-1' });

    await controller.getAcpSession({ user: { id: 'jwt-user' } }, 'acp-1');

    expect(mockAcpBridgeService.loadSession).toHaveBeenCalledWith('acp-1', 'jwt-user');
  });

  it('resolves user context for ACP action invocation', async () => {
    mockAcpBridgeService.invokeAction.mockResolvedValue({ success: true });

    await controller.invokeAcpAction(
      { user: { id: 'jwt-user' } },
      'skill-1',
      { sessionId: 'acp-1', parameters: { city: 'shanghai' } },
    );

    expect(mockAcpBridgeService.invokeAction).toHaveBeenCalledWith(
      'acp-1',
      'skill-1',
      { city: 'shanghai' },
      'jwt-user',
    );
  });
});
