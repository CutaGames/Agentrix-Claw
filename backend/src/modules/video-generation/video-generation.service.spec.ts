import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { VideoGenerationService } from './video-generation.service';

describe('VideoGenerationService', () => {
  let service: VideoGenerationService;

  const tasks = new Map<string, any>();
  const taskRepo = {
    create: jest.fn((value: any) => ({
      createdAt: new Date('2026-04-10T00:00:00.000Z'),
      updatedAt: new Date('2026-04-10T00:00:00.000Z'),
      ...value,
    })),
    save: jest.fn(async (value: any) => {
      const saved = {
        createdAt: value.createdAt || new Date('2026-04-10T00:00:00.000Z'),
        updatedAt: new Date('2026-04-10T00:00:00.000Z'),
        ...value,
      };
      tasks.set(saved.taskId, saved);
      return saved;
    }),
    findOne: jest.fn(async ({ where }: any) => {
      if (where?.taskId) {
        const task = tasks.get(where.taskId);
        if (!task) {
          return null;
        }
        if (where.userId && task.userId !== where.userId) {
          return null;
        }
        return task;
      }
      return null;
    }),
    find: jest.fn(async () => []),
  };
  const sessionRepo = { findOne: jest.fn(async () => null) };
  const messageRepo = {
    count: jest.fn(async () => 0),
    create: jest.fn((value: any) => value),
    save: jest.fn(async (value: any) => value),
  };
  const configService = {
    get: jest.fn((key: string) => {
      if (key === 'VIDEO_FAL_TEXT_MODEL') return undefined;
      if (key === 'VIDEO_FAL_IMAGE_MODEL') return undefined;
      if (key === 'VIDEO_FAL_VIDEO_TO_VIDEO_MODEL') return undefined;
      return undefined;
    }),
  };
  const aiProviderService = {
    getDecryptedKey: jest.fn(async () => ({ apiKey: 'fal-key' })),
  };
  const desktopSyncService = {
    upsertTask: jest.fn(async () => undefined),
    notifyAgentCompletion: jest.fn(async () => undefined),
  };
  const falProvider = {
    submit: jest.fn(async () => ({ request_id: 'fal-request-1' })),
    getStatus: jest.fn(),
    getResult: jest.fn(),
    extractVideoUrl: jest.fn(),
    extractThumbnailUrl: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    tasks.clear();
    service = new VideoGenerationService(
      taskRepo as any,
      sessionRepo as any,
      messageRepo as any,
      configService as any,
      aiProviderService as any,
      desktopSyncService as any,
      falProvider as any,
    );
  });

  it('maps image_to_video params into the image-to-video provider contract', async () => {
    await service.executeTool(
      {
        mode: 'image_to_video',
        referenceImageUrl: 'https://cdn.example.com/reference.png',
        endImageUrl: 'https://cdn.example.com/end.png',
      },
      {
        userId: 'user-1',
        sessionId: 'session-1',
        platform: 'desktop',
        metadata: { deviceId: 'desktop-1' },
      } as any,
    );

    expect(falProvider.submit).toHaveBeenCalledWith(
      'fal-key',
      'fal-ai/kling-video/v2.1/master/image-to-video',
      expect.objectContaining({
        image_url: 'https://cdn.example.com/reference.png',
        tail_image_url: 'https://cdn.example.com/end.png',
      }),
    );
  });

  it('maps video_to_video params into the motion-control contract', async () => {
    await service.executeTool(
      {
        mode: 'video_to_video',
        prompt: 'Preserve the subject identity while following the dance timing from the source clip.',
        referenceImageUrl: 'https://cdn.example.com/subject.png',
        referenceVideoUrl: 'https://cdn.example.com/source.mp4',
        keepOriginalSound: false,
        characterOrientation: 'image',
      },
      {
        userId: 'user-1',
        sessionId: 'session-2',
        platform: 'desktop',
        metadata: { deviceId: 'desktop-2' },
      } as any,
    );

    expect(falProvider.submit).toHaveBeenCalledWith(
      'fal-key',
      'fal-ai/kling-video/v2.1/master/motion-control',
      expect.objectContaining({
        prompt: 'Preserve the subject identity while following the dance timing from the source clip.',
        image_url: 'https://cdn.example.com/subject.png',
        video_url: 'https://cdn.example.com/source.mp4',
        keep_original_sound: false,
        character_orientation: 'image',
      }),
    );
    expect(desktopSyncService.upsertTask).toHaveBeenCalled();
  });
});