import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DockerSandboxService } from './docker-sandbox.service';
import { SandboxInstance } from '../../entities/sandbox-instance.entity';

// Mock dockerode at module level
const mockContainer = {
  id: 'fakecontainerid1234567890',
  start: jest.fn().mockResolvedValue(undefined),
  remove: jest.fn().mockResolvedValue(undefined),
  exec: jest.fn(),
  modem: undefined as any,
};

const mockExec = {
  start: jest.fn(),
  inspect: jest.fn().mockResolvedValue({ ExitCode: 0 }),
};

const mockDockerInstance = {
  ping: jest.fn().mockResolvedValue('OK'),
  info: jest.fn().mockResolvedValue({
    Containers: 1,
    ContainersRunning: 1,
    ServerVersion: '24.0.0',
    MemTotal: 8 * 1024 * 1024 * 1024,
  }),
  createContainer: jest.fn().mockResolvedValue(mockContainer),
  getContainer: jest.fn().mockReturnValue(mockContainer),
  getImage: jest.fn().mockReturnValue({ inspect: jest.fn().mockResolvedValue({}) }),
  pull: jest.fn(),
  modem: {
    demuxStream: jest.fn((stream: any, stdoutSink: any, stderrSink: any) => {
      // Simulate one chunk to stdout, then end
      setImmediate(() => {
        stdoutSink.write(Buffer.from('hello\n'));
        stream.emit('end');
      });
    }),
    followProgress: jest.fn((s: any, cb: any) => cb(null)),
  },
};

jest.mock('dockerode', () => {
  return jest.fn().mockImplementation(() => mockDockerInstance);
});

describe('DockerSandboxService', () => {
  let service: DockerSandboxService;
  let repo: { create: jest.Mock; save: jest.Mock; findOne: jest.Mock; find: jest.Mock };

  beforeEach(async () => {
    jest.clearAllMocks();
    repo = {
      create: jest.fn((data) => ({ ...data })),
      save: jest.fn(async (data) => ({
        id: data.id ?? 'inst-1',
        ...data,
      })),
      findOne: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        DockerSandboxService,
        { provide: getRepositoryToken(SandboxInstance), useValue: repo },
      ],
    }).compile();

    service = moduleRef.get(DockerSandboxService);

    // wire modem so demuxStream is reachable from container.modem too
    mockContainer.modem = mockDockerInstance.modem;

    // Default exec.start returns a stream-like object
    const { Readable } = require('stream');
    mockContainer.exec = jest.fn().mockResolvedValue(mockExec);
    mockExec.start = jest.fn().mockImplementation(() => {
      const r = new Readable({ read() {} });
      return Promise.resolve(r);
    });
    mockExec.inspect = jest.fn().mockResolvedValue({ ExitCode: 0 });
  });

  it('should be defined and report docker availability', async () => {
    expect(service).toBeDefined();
    await expect(service.isDockerAvailable()).resolves.toBe(true);
  });

  it('spawn() creates a container and persists running state', async () => {
    const inst = await service.spawn({ userId: 'user-1' });
    expect(mockDockerInstance.createContainer).toHaveBeenCalledTimes(1);
    expect(mockContainer.start).toHaveBeenCalledTimes(1);
    expect(inst.status).toBe('running');
    expect(inst.containerId).toBe(mockContainer.id);
    expect(inst.userId).toBe('user-1');
    // ensures NetworkDisabled was set
    const arg = mockDockerInstance.createContainer.mock.calls[0][0];
    expect(arg.NetworkDisabled).toBe(true);
    expect(arg.HostConfig.Memory).toBeGreaterThan(0);
  });

  it('exec() returns stdout from demuxed stream and exit code', async () => {
    repo.findOne.mockResolvedValue({
      id: 'inst-1',
      userId: 'user-1',
      containerId: mockContainer.id,
      status: 'running',
      workDir: '/workspace',
    });

    const r = await service.exec('inst-1', { cmd: 'echo hello' }, 'user-1');
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toContain('hello');
    expect(r.truncated).toBe(false);
    expect(mockContainer.exec).toHaveBeenCalledTimes(1);
  });

  it('exec() rejects if status is not running', async () => {
    repo.findOne.mockResolvedValue({
      id: 'inst-1',
      userId: 'user-1',
      containerId: null,
      status: 'destroyed',
      workDir: '/workspace',
    });
    await expect(service.exec('inst-1', { cmd: 'ls' }, 'user-1')).rejects.toThrow(/not running/);
  });

  it('destroy() removes container and updates state', async () => {
    repo.findOne.mockResolvedValue({
      id: 'inst-1',
      userId: 'user-1',
      containerId: mockContainer.id,
      status: 'running',
    });
    await service.destroy('inst-1', 'user-1');
    expect(mockContainer.remove).toHaveBeenCalledWith({ force: true });
    const lastSave = repo.save.mock.calls.at(-1)[0];
    expect(lastSave.status).toBe('destroyed');
  });

  it('destroy() rejects when userId mismatches', async () => {
    repo.findOne.mockResolvedValue({
      id: 'inst-1',
      userId: 'other-user',
      containerId: mockContainer.id,
      status: 'running',
    });
    await expect(service.destroy('inst-1', 'user-1')).rejects.toThrow();
  });
});
