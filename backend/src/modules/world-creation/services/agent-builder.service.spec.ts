import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AgentBuilderService } from './agent-builder.service';
import { EcsWorldService } from './ecs-world.service';
import { QuotaService } from '../../world-engine/services/quota.service';
import { WorldPlot } from '../entities/world-plot.entity';
import { AgentAccount } from '../../../entities/agent-account.entity';
import { ECS_GENERATOR_PROVIDER } from '../generation/ecs-generator.provider';
import { ECS_VERSION } from '../../../../shared/types/world-creation';
import type { EcsWorld } from '../../../../shared/types/world-creation';
import type { AutonomousTaskInstruction } from './agent-builder.service';

/**
 * Unit tests for AgentBuilderService.runAutonomousTask diff attribution
 * (Task 11.3, R9.7).
 *
 * Focus: an offline autonomous Creation_Task run by a bound Agent_Builder
 * commits its diff through the SAME EcsWorldService channel as user edits, with
 * author = {type:'agent', id:agentId}, producing a diff whose
 * authorType==='agent' and authorId===agentId (readable / diffable / reversible).
 */
describe('AgentBuilderService — autonomous diff attribution (R9.7)', () => {
  let service: AgentBuilderService;

  let plotRepo: { findOne: jest.Mock; save: jest.Mock; update: jest.Mock };
  let agentAccountRepo: { findOne: jest.Mock };
  let ecsWorldService: {
    getCurrentVersion: jest.Mock;
    loadWorldAtVersion: jest.Mock;
    validateTier: jest.Mock;
    commitDiff: jest.Mock;
  };

  const PLOT_ID = 'plot-1';
  const AGENT_ID = 'agent-7';
  const BASE_VERSION_ID = 'v1';
  const NEW_VERSION_ID = 'v2';

  const baseWorld = (): EcsWorld => ({
    ecsVersion: ECS_VERSION,
    plotId: PLOT_ID,
    substrateTier: 'B',
    entities: [{ id: 'e1', components: { transform: { pos: [0, 0, 0] } } }],
  });

  const instruction: AutonomousTaskInstruction = {
    ops: [
      {
        op: 'add',
        path: '/entities/1',
        value: { id: 'e2', components: { transform: { pos: [1, 1, 1] } } },
      },
    ],
    baseVersionId: BASE_VERSION_ID,
    description: 'add a prop',
  };

  beforeEach(async () => {
    plotRepo = {
      findOne: jest.fn(),
      save: jest.fn(async (v) => v),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    agentAccountRepo = { findOne: jest.fn() };
    ecsWorldService = {
      getCurrentVersion: jest.fn(),
      loadWorldAtVersion: jest.fn().mockResolvedValue(baseWorld()),
      validateTier: jest.fn().mockReturnValue(null),
      commitDiff: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentBuilderService,
        { provide: QuotaService, useValue: {} },
        { provide: getRepositoryToken(WorldPlot), useValue: plotRepo },
        { provide: getRepositoryToken(AgentAccount), useValue: agentAccountRepo },
        { provide: EcsWorldService, useValue: ecsWorldService },
        { provide: ECS_GENERATOR_PROVIDER, useValue: { generateDraft: jest.fn() } },
      ],
    }).compile();

    service = module.get(AgentBuilderService);
  });

  it('commits the autonomous diff with author={type:"agent", id:agentId} (R9.7)', async () => {
    plotRepo.findOne.mockResolvedValue({
      id: PLOT_ID,
      boundAgentId: AGENT_ID,
      ecsVersionId: BASE_VERSION_ID,
    });
    ecsWorldService.commitDiff.mockImplementation(
      async (plotId, parent, world, ops, author) => ({
        version: { id: NEW_VERSION_ID },
        diff: {
          versionId: NEW_VERSION_ID,
          parent,
          plotId,
          authorType: author.type,
          authorId: author.id,
          ops,
          ts: 123,
        },
      }),
    );

    const result = await service.runAutonomousTask(PLOT_ID, AGENT_ID, instruction);

    expect(result.committed).toBe(true);
    // The author argument passed into the shared diff channel is the agent.
    const authorArg = ecsWorldService.commitDiff.mock.calls[0][4];
    expect(authorArg).toEqual({ type: 'agent', id: AGENT_ID });
    // The produced diff is attributed to the agent (diffable / reversible).
    expect(result.diff?.authorType).toBe('agent');
    expect(result.diff?.authorId).toBe(AGENT_ID);
    // Plot's current version pointer advanced so the offline edit takes effect.
    expect(plotRepo.update).toHaveBeenCalledWith(
      { id: PLOT_ID },
      { ecsVersionId: NEW_VERSION_ID },
    );
  });

  it('rejects an unbound agent without committing any diff', async () => {
    plotRepo.findOne.mockResolvedValue({
      id: PLOT_ID,
      boundAgentId: 'someone-else',
      ecsVersionId: BASE_VERSION_ID,
    });

    await expect(
      service.runAutonomousTask(PLOT_ID, AGENT_ID, instruction),
    ).rejects.toThrow();
    expect(ecsWorldService.commitDiff).not.toHaveBeenCalled();
  });

  it('rejects a tier-violating offline product without committing (no diff written, R9.6)', async () => {
    plotRepo.findOne.mockResolvedValue({
      id: PLOT_ID,
      boundAgentId: AGENT_ID,
      ecsVersionId: BASE_VERSION_ID,
    });
    ecsWorldService.validateTier.mockReturnValue({
      error: 'TIER_VIOLATION',
      detail: 'Tier_B may not declare logicModules',
    });

    const result = await service.runAutonomousTask(PLOT_ID, AGENT_ID, instruction);

    expect(result.committed).toBe(false);
    expect(result.error?.error).toBe('TIER_VIOLATION');
    expect(ecsWorldService.commitDiff).not.toHaveBeenCalled();
    expect(plotRepo.update).not.toHaveBeenCalled();
  });
});
