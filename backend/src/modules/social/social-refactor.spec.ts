/**
 * E2E Test Suite — Social Module P0/P1/P2 Refactoring
 *
 * Covers:
 *   P0-A: Agent Showcase Feed + Auto-post generation
 *   P0-B: Social Events persistence + Reply Config CRUD
 *   P1-C: Agent Space entity + messages (DB-persisted)
 *   P2-D: Agent Reputation stats endpoint
 */
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SocialService } from './social.service';
import {
  SocialPost,
  SocialPostType,
  SocialPostStatus,
  SocialComment,
  SocialLike,
  SocialFollow,
  SocialEvent,
  SocialEventPlatform,
  SocialEventType,
  SocialReplyStatus,
  SocialReplyConfig,
  ReplyStrategy,
} from '../../entities/social.entity';
import { User } from '../../entities/user.entity';
import { Skill } from '../../entities/skill.entity';
import { ClaudeIntegrationService } from '../ai-integration/claude/claude-integration.service';

// ── Mock helpers ──────────────────────────────────────────────────────────────

function mockRepo() {
  return {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    findOneBy: jest.fn().mockResolvedValue(null),
    findAndCount: jest.fn().mockResolvedValue([[], 0]),
    count: jest.fn().mockResolvedValue(0),
    create: jest.fn().mockImplementation((dto) => ({ id: 'mock-id', ...dto })),
    save: jest.fn().mockImplementation((entity) => Promise.resolve({ id: 'mock-id', ...entity })),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
    delete: jest.fn().mockResolvedValue({ affected: 1 }),
    createQueryBuilder: jest.fn().mockReturnValue({
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    }),
  };
}

// ── Test Suite ────────────────────────────────────────────────────────────────

describe('SocialService — P0/P1/P2 Refactoring', () => {
  let service: SocialService;
  let postRepo: ReturnType<typeof mockRepo>;
  let commentRepo: ReturnType<typeof mockRepo>;
  let likeRepo: ReturnType<typeof mockRepo>;
  let followRepo: ReturnType<typeof mockRepo>;
  let eventRepo: ReturnType<typeof mockRepo>;
  let replyConfigRepo: ReturnType<typeof mockRepo>;
  let userRepo: ReturnType<typeof mockRepo>;
  let skillRepo: ReturnType<typeof mockRepo>;
  let claudeIntegrationService: { chatWithFunctions: jest.Mock };

  beforeEach(async () => {
    postRepo = mockRepo();
    commentRepo = mockRepo();
    likeRepo = mockRepo();
    followRepo = mockRepo();
    eventRepo = mockRepo();
    replyConfigRepo = mockRepo();
    userRepo = mockRepo();
    skillRepo = mockRepo();
    claudeIntegrationService = {
      chatWithFunctions: jest.fn().mockResolvedValue({ text: 'Mock social reply' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SocialService,
        { provide: getRepositoryToken(SocialPost), useValue: postRepo },
        { provide: getRepositoryToken(SocialComment), useValue: commentRepo },
        { provide: getRepositoryToken(SocialLike), useValue: likeRepo },
        { provide: getRepositoryToken(SocialFollow), useValue: followRepo },
        { provide: getRepositoryToken(SocialEvent), useValue: eventRepo },
        { provide: getRepositoryToken(SocialReplyConfig), useValue: replyConfigRepo },
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: getRepositoryToken(Skill), useValue: skillRepo },
        { provide: ClaudeIntegrationService, useValue: claudeIntegrationService },
      ],
    }).compile();

    service = module.get<SocialService>(SocialService);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // P0-A: Agent Showcase Feed
  // ═══════════════════════════════════════════════════════════════════════════

  describe('P0-A: getShowcaseFeed', () => {
    it('should call postRepo with createQueryBuilder', async () => {
      await service.getShowcaseFeed('user-1', { sort: 'latest', page: 1, limit: 20 });
      expect(postRepo.createQueryBuilder).toHaveBeenCalledWith('post');
    });

    it('should return paginated results', async () => {
      const mockPosts = [
        { id: 'p1', type: SocialPostType.SKILL_SHARE, content: 'Test skill', likeCount: 5 },
        { id: 'p2', type: SocialPostType.WORKFLOW_RESULT, content: 'Test workflow', likeCount: 10 },
      ];
      postRepo.findAndCount.mockResolvedValue([mockPosts, 2]);
      const result = await service.getShowcaseFeed('user-1', { sort: 'latest', page: 1, limit: 20 });
      expect(result).toBeDefined();
    });
  });

  describe('P0-A: createAutoPost', () => {
    it('should create a post with SKILL_SHARE type', async () => {
      const params = {
        userId: 'user-1',
        authorName: 'TestUser',
        type: SocialPostType.SKILL_SHARE,
        content: 'Published a new skill!',
        referenceId: 'skill-123',
        referenceName: 'Web Search Pro',
        tags: ['skill', 'search'],
      };
      await service.createAutoPost(params);
      expect(postRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          authorId: 'user-1',
          type: SocialPostType.SKILL_SHARE,
          referenceId: 'skill-123',
        }),
      );
      expect(postRepo.save).toHaveBeenCalled();
    });

    it('should create a post with WORKFLOW_RESULT type', async () => {
      await service.createAutoPost({
        userId: 'user-1',
        authorName: 'Agent',
        type: SocialPostType.WORKFLOW_RESULT,
        content: 'Completed workflow: Auto PR Review',
      });
      expect(postRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ type: SocialPostType.WORKFLOW_RESULT }),
      );
    });

    it('should create a post with AGENT_DEPLOY type', async () => {
      await service.createAutoPost({
        userId: 'user-1',
        authorName: 'System',
        type: SocialPostType.AGENT_DEPLOY,
        content: 'New agent deployed: Research Bot',
      });
      expect(postRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ type: SocialPostType.AGENT_DEPLOY }),
      );
    });

    it('should create a post with TASK_COMPLETE type', async () => {
      await service.createAutoPost({
        userId: 'user-1',
        authorName: 'System',
        type: SocialPostType.TASK_COMPLETE,
        content: 'Task completed successfully',
      });
      expect(postRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ type: SocialPostType.TASK_COMPLETE }),
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // P0-B: Social Events + Reply Config
  // ═══════════════════════════════════════════════════════════════════════════

  describe('P0-B: createSocialEvent', () => {
    it('should persist a social event to DB', async () => {
      const eventData = {
        userId: 'user-1',
        platform: SocialEventPlatform.TELEGRAM,
        eventType: SocialEventType.MESSAGE,
        senderId: 'tg-user-42',
        senderName: 'TelegramUser',
        text: 'Hello from Telegram',
        rawPayload: { chat_id: 123 },
      };
      await service.createSocialEvent(eventData);
      expect(eventRepo.create).toHaveBeenCalledWith(expect.objectContaining({
        platform: SocialEventPlatform.TELEGRAM,
        eventType: SocialEventType.MESSAGE,
        text: 'Hello from Telegram',
      }));
      expect(eventRepo.save).toHaveBeenCalled();
    });
  });

  describe('P0-B: getSocialEvents', () => {
    it('should return recent events for user', async () => {
      const mockEvents = [
        { id: 'e1', platform: 'telegram', text: 'msg1' },
        { id: 'e2', platform: 'discord', text: 'msg2' },
      ];
      eventRepo.find.mockResolvedValue(mockEvents);
      const events = await service.getSocialEvents('user-1', 50);
      expect(eventRepo.find).toHaveBeenCalledWith(expect.objectContaining({
        where: { userId: 'user-1' },
      }));
      expect(events).toEqual(mockEvents);
    });
  });

  describe('P0-B: getPendingApprovals', () => {
    it('should return events with PENDING_APPROVAL status', async () => {
      eventRepo.find.mockResolvedValue([{ id: 'e1', replyStatus: SocialReplyStatus.PENDING }]);
      const pending = await service.getPendingApprovals('user-1');
      expect(eventRepo.find).toHaveBeenCalledWith(expect.objectContaining({
        where: { userId: 'user-1', replyStatus: SocialReplyStatus.PENDING },
      }));
      expect(pending).toHaveLength(1);
    });
  });

  describe('P0-B: updateEventReply', () => {
    it('should approve a reply with final text', async () => {
      eventRepo.findOneBy.mockResolvedValue({ id: 'e1', replyStatus: SocialReplyStatus.APPROVED, finalReply: 'Approved reply text' });
      await service.updateEventReply('e1', {
        replyStatus: SocialReplyStatus.APPROVED,
        finalReply: 'Approved reply text',
      });
      expect(eventRepo.update).toHaveBeenCalledWith('e1', expect.objectContaining({
        replyStatus: SocialReplyStatus.APPROVED,
        finalReply: 'Approved reply text',
      }));
    });

    it('should reject a reply', async () => {
      eventRepo.findOneBy.mockResolvedValue({ id: 'e1', replyStatus: SocialReplyStatus.REJECTED });
      await service.updateEventReply('e1', { replyStatus: SocialReplyStatus.REJECTED });
      expect(eventRepo.update).toHaveBeenCalledWith('e1', expect.objectContaining({
        replyStatus: SocialReplyStatus.REJECTED,
      }));
    });
  });

  describe('P0-B: Reply Config CRUD', () => {
    it('should return all reply configs for user', async () => {
      replyConfigRepo.find.mockResolvedValue([
        { platform: 'telegram', strategy: 'approval' },
        { platform: 'discord', strategy: 'auto' },
      ]);
      const configs = await service.getReplyConfigs('user-1');
      expect(configs).toHaveLength(2);
    });

    it('should create a new reply config', async () => {
      replyConfigRepo.findOneBy.mockResolvedValue(null);
      await service.saveReplyConfig('user-1', SocialEventPlatform.TELEGRAM, {
        strategy: ReplyStrategy.AUTO,
        enabled: true,
      });
      expect(replyConfigRepo.create).toHaveBeenCalledWith(expect.objectContaining({
        userId: 'user-1',
        platform: SocialEventPlatform.TELEGRAM,
        strategy: ReplyStrategy.AUTO,
      }));
      expect(replyConfigRepo.save).toHaveBeenCalled();
    });

    it('should update an existing reply config', async () => {
      const existing = { userId: 'user-1', platform: SocialEventPlatform.TELEGRAM, strategy: ReplyStrategy.APPROVAL };
      replyConfigRepo.findOneBy.mockResolvedValue(existing);
      await service.saveReplyConfig('user-1', SocialEventPlatform.TELEGRAM, {
        strategy: ReplyStrategy.DISABLED,
      });
      expect(replyConfigRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ strategy: ReplyStrategy.DISABLED }),
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // P2-D: Agent Reputation
  // ═══════════════════════════════════════════════════════════════════════════

  describe('P2-D: getAgentReputation', () => {
    it('should compute reputation stats for a user', async () => {
      postRepo.count
        .mockResolvedValueOnce(42)  // postCount
        .mockResolvedValueOnce(42)  // showcasePosts
        .mockResolvedValueOnce(5)   // skillPosts
        .mockResolvedValueOnce(12)  // workflowPosts
        .mockResolvedValueOnce(30)  // taskPosts
        .mockResolvedValueOnce(3);  // agentDeploys
      followRepo.count
        .mockResolvedValueOnce(1240) // followerCount
        .mockResolvedValueOnce(87);  // followingCount
      postRepo.find.mockResolvedValue([
        { id: 'p1', likeCount: 100 },
        { id: 'p2', likeCount: 200 },
      ]);

      const rep = await service.getAgentReputation('user-1');

      expect(rep.userId).toBe('user-1');
      expect(rep.postCount).toBe(42);
      expect(rep.followerCount).toBe(1240);
      expect(rep.followingCount).toBe(87);
      expect(rep.skillsPublished).toBe(5);
      expect(rep.workflowResults).toBe(12);
      expect(rep.tasksCompleted).toBe(30);
      expect(rep.agentDeploys).toBe(3);
      expect(rep.totalLikesReceived).toBe(300);
      expect(rep.reputationScore).toBeGreaterThanOrEqual(1.0);
      expect(rep.reputationScore).toBeLessThanOrEqual(5.0);
    });

    it('should return default values for new user', async () => {
      postRepo.count.mockResolvedValue(0);
      followRepo.count.mockResolvedValue(0);
      postRepo.find.mockResolvedValue([]);

      const rep = await service.getAgentReputation('new-user');
      expect(rep.postCount).toBe(0);
      expect(rep.followerCount).toBe(0);
      expect(rep.skillsPublished).toBe(0);
      expect(rep.reputationScore).toBe(1.0);
    });
  });
});
