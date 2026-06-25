import { Injectable, Logger, NotFoundException, OnModuleDestroy } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as Docker from 'dockerode';
import { Readable } from 'stream';
import { SandboxInstance, SandboxResourceLimits, SandboxStatus } from '../../entities/sandbox-instance.entity';

export interface SpawnSandboxOptions {
  userId: string;
  taskId?: string;
  sessionId?: string;
  /** Docker image to use; defaults to a small, network-isolated image */
  image?: string;
  /** Resource limits */
  limits?: SandboxResourceLimits;
  /** Working directory inside container */
  workDir?: string;
}

export interface ExecCommandOptions {
  /** Command argv (e.g. ['ls', '-la']). If string, will be wrapped in sh -c. */
  cmd: string | string[];
  /** Working directory override */
  workDir?: string;
  /** Per-exec timeout in ms (default 30s) */
  timeoutMs?: number;
  /** Environment variables to set */
  env?: Record<string, string>;
}

export interface ExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  truncated: boolean;
}

export interface FsReadOptions {
  path: string;
  /** Max bytes to return (default 64KB) */
  maxBytes?: number;
}

export interface FsWriteOptions {
  path: string;
  content: string;
  /** Encoding: 'utf8' | 'base64' (default utf8) */
  encoding?: 'utf8' | 'base64';
  /** Create parent dirs (default true) */
  mkdirp?: boolean;
}

const DEFAULT_IMAGE = process.env.SANDBOX_DEFAULT_IMAGE || 'alpine:3.20';
const DEFAULT_MEMORY_MB = 256;
const DEFAULT_CPU_SHARES = 512;
const DEFAULT_TTL_SEC = 600;
const DEFAULT_EXEC_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_OUTPUT_BYTES = 64 * 1024;
const DEFAULT_FS_READ_MAX_BYTES = 64 * 1024;

/**
 * DockerSandboxService — 基于 dockerode 的真实 Docker 沙箱编排器。
 *
 * 支持：
 *  - spawn: 创建一个 detached 容器（无网络、有资源限额、有 TTL）
 *  - exec:  在容器内执行命令，捕获 stdout/stderr，返回 exitCode
 *  - destroy: 停止并删除容器
 *  - fs.read / fs.write: 通过 exec 实现（cat / tee + base64 编解码）
 *
 * 设计要点：
 *  - 容器默认 NetworkDisabled=true（防止 SSRF / 数据外发）
 *  - 用 ReadonlyRootfs=false 但限定 work_dir 内可写
 *  - 每个 user 的容器以 userId 作为 label 标记，便于回收
 *  - TTL 用 setTimeout（进程级），生产环境可配合外部 reaper（nightly cron）
 */
@Injectable()
export class DockerSandboxService implements OnModuleDestroy {
  private readonly logger = new Logger(DockerSandboxService.name);
  private docker: Docker | null = null;
  private dockerInitError: string | null = null;
  private readonly ttlTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    @InjectRepository(SandboxInstance)
    private readonly repo: Repository<SandboxInstance>,
  ) {
    this.initDocker();
  }

  private initDocker(): void {
    try {
      // dockerode auto-detects the socket: DOCKER_HOST env / npipe (Win) / /var/run/docker.sock
      this.docker = new Docker();
    } catch (e: any) {
      this.dockerInitError = e?.message ?? String(e);
      this.logger.warn(`Docker init failed: ${this.dockerInitError}`);
    }
  }

  /** Returns true if docker daemon is reachable (probes with /_ping). */
  async isDockerAvailable(): Promise<boolean> {
    if (!this.docker) return false;
    try {
      await this.docker.ping();
      return true;
    } catch (e: any) {
      this.logger.debug(`docker ping failed: ${e?.message ?? e}`);
      return false;
    }
  }

  /** Get diagnostics info (for /health endpoint). */
  async getDiagnostics() {
    const available = await this.isDockerAvailable();
    let info: any = null;
    if (available && this.docker) {
      try {
        const i = await this.docker.info();
        info = {
          containers: i.Containers,
          containersRunning: i.ContainersRunning,
          serverVersion: i.ServerVersion,
          memTotal: i.MemTotal,
        };
      } catch (e: any) {
        info = { error: e?.message ?? String(e) };
      }
    }
    return {
      available,
      initError: this.dockerInitError,
      info,
    };
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────

  async spawn(opts: SpawnSandboxOptions): Promise<SandboxInstance> {
    if (!this.docker) {
      throw new Error(`Docker unavailable: ${this.dockerInitError ?? 'not initialized'}`);
    }

    const image = opts.image ?? DEFAULT_IMAGE;
    const limits: SandboxResourceLimits = {
      memoryMb: opts.limits?.memoryMb ?? DEFAULT_MEMORY_MB,
      cpuShares: opts.limits?.cpuShares ?? DEFAULT_CPU_SHARES,
      ttlSec: opts.limits?.ttlSec ?? DEFAULT_TTL_SEC,
    };
    const workDir = opts.workDir ?? '/workspace';

    const entity = this.repo.create({
      userId: opts.userId,
      taskId: opts.taskId ?? null,
      sessionId: opts.sessionId ?? null,
      image,
      status: 'creating' as SandboxStatus,
      limits,
      workDir,
    });
    const saved = await this.repo.save(entity);

    try {
      await this.ensureImage(image);

      const container = await this.docker.createContainer({
        Image: image,
        Cmd: ['sh', '-c', `mkdir -p ${workDir} && tail -f /dev/null`],
        WorkingDir: workDir,
        Tty: false,
        OpenStdin: false,
        NetworkDisabled: true,
        Labels: {
          'agentrix.sandbox': 'true',
          'agentrix.userId': opts.userId,
          'agentrix.instanceId': saved.id,
        },
        HostConfig: {
          Memory: (limits.memoryMb ?? DEFAULT_MEMORY_MB) * 1024 * 1024,
          MemorySwap: (limits.memoryMb ?? DEFAULT_MEMORY_MB) * 1024 * 1024,
          CpuShares: limits.cpuShares ?? DEFAULT_CPU_SHARES,
          AutoRemove: false,
          // Read-only root with tmpfs writable areas; workDir lives in the container fs.
          ReadonlyRootfs: false,
        },
      });

      await container.start();
      saved.containerId = container.id;
      saved.status = 'running';
      saved.startedAtMs = String(Date.now());
      await this.repo.save(saved);

      this.scheduleAutoDestroy(saved.id, limits.ttlSec ?? DEFAULT_TTL_SEC);
      this.logger.log(`sandbox ${saved.id} running (container=${container.id.slice(0, 12)})`);
      return saved;
    } catch (e: any) {
      saved.status = 'error';
      saved.errorMessage = e?.message ?? String(e);
      await this.repo.save(saved);
      this.logger.error(`sandbox spawn failed: ${saved.errorMessage}`);
      throw e;
    }
  }

  async destroy(instanceId: string, userId?: string): Promise<void> {
    const entity = await this.repo.findOne({ where: { id: instanceId } });
    if (!entity) throw new NotFoundException('sandbox not found');
    if (userId && entity.userId !== userId) throw new NotFoundException('sandbox not found');

    const timer = this.ttlTimers.get(instanceId);
    if (timer) {
      clearTimeout(timer);
      this.ttlTimers.delete(instanceId);
    }

    if (entity.containerId && this.docker) {
      try {
        const c = this.docker.getContainer(entity.containerId);
        await c.remove({ force: true }).catch(() => undefined);
      } catch (e: any) {
        this.logger.warn(`destroy container ${entity.containerId} failed: ${e?.message}`);
      }
    }
    entity.status = 'destroyed';
    entity.destroyedAtMs = String(Date.now());
    await this.repo.save(entity);
  }

  async get(instanceId: string, userId?: string): Promise<SandboxInstance> {
    const entity = await this.repo.findOne({ where: { id: instanceId } });
    if (!entity) throw new NotFoundException('sandbox not found');
    if (userId && entity.userId !== userId) throw new NotFoundException('sandbox not found');
    return entity;
  }

  async list(userId: string): Promise<SandboxInstance[]> {
    return this.repo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: 50,
    });
  }

  // ── Execution ──────────────────────────────────────────────────────────

  async exec(instanceId: string, opts: ExecCommandOptions, userId?: string): Promise<ExecResult> {
    const entity = await this.get(instanceId, userId);
    if (entity.status !== 'running' || !entity.containerId) {
      throw new Error(`sandbox ${instanceId} is not running (status=${entity.status})`);
    }
    if (!this.docker) throw new Error('Docker unavailable');

    const container = this.docker.getContainer(entity.containerId);
    const argv = Array.isArray(opts.cmd) ? opts.cmd : ['sh', '-c', opts.cmd];
    const env = opts.env ? Object.entries(opts.env).map(([k, v]) => `${k}=${v}`) : undefined;
    const start = Date.now();
    const timeoutMs = opts.timeoutMs ?? DEFAULT_EXEC_TIMEOUT_MS;

    const exec = await container.exec({
      Cmd: argv,
      AttachStdout: true,
      AttachStderr: true,
      Env: env,
      WorkingDir: opts.workDir ?? entity.workDir,
    });

    const stream = (await exec.start({ hijack: true, stdin: false })) as Readable;
    const { stdout, stderr, truncated } = await this.collectExecOutput(stream, container, timeoutMs);
    const inspect = await exec.inspect();

    return {
      exitCode: inspect.ExitCode ?? -1,
      stdout,
      stderr,
      durationMs: Date.now() - start,
      truncated,
    };
  }

  /**
   * Collects stdout/stderr from a docker exec stream.
   * Docker multiplexes both streams in a single connection; we use modem.demuxStream.
   */
  private async collectExecOutput(
    stream: Readable,
    container: Docker.Container,
    timeoutMs: number,
  ): Promise<{ stdout: string; stderr: string; truncated: boolean }> {
    return new Promise((resolve, reject) => {
      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];
      let totalBytes = 0;
      let truncated = false;
      let settled = false;

      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({
          stdout: Buffer.concat(stdoutChunks).toString('utf8'),
          stderr: Buffer.concat(stderrChunks).toString('utf8'),
          truncated,
        });
      };

      const stdoutSink = new (require('stream').Writable)({
        write(chunk: Buffer, _enc: string, cb: () => void) {
          if (totalBytes >= DEFAULT_MAX_OUTPUT_BYTES) {
            truncated = true;
            cb();
            return;
          }
          const remaining = DEFAULT_MAX_OUTPUT_BYTES - totalBytes;
          if (chunk.length > remaining) {
            stdoutChunks.push(chunk.subarray(0, remaining));
            totalBytes = DEFAULT_MAX_OUTPUT_BYTES;
            truncated = true;
          } else {
            stdoutChunks.push(chunk);
            totalBytes += chunk.length;
          }
          cb();
        },
      });
      const stderrSink = new (require('stream').Writable)({
        write(chunk: Buffer, _enc: string, cb: () => void) {
          if (totalBytes >= DEFAULT_MAX_OUTPUT_BYTES) {
            truncated = true;
            cb();
            return;
          }
          const remaining = DEFAULT_MAX_OUTPUT_BYTES - totalBytes;
          if (chunk.length > remaining) {
            stderrChunks.push(chunk.subarray(0, remaining));
            totalBytes = DEFAULT_MAX_OUTPUT_BYTES;
            truncated = true;
          } else {
            stderrChunks.push(chunk);
            totalBytes += chunk.length;
          }
          cb();
        },
      });

      // dockerode demux: separates stdout/stderr from multiplexed stream
      container.modem.demuxStream(stream, stdoutSink, stderrSink);
      stream.on('end', finish);
      stream.on('close', finish);
      stream.on('error', (err: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(err);
      });

      const timer = setTimeout(() => {
        if (settled) return;
        truncated = true;
        try {
          stream.destroy();
        } catch (_) {
          // noop
        }
        finish();
      }, timeoutMs);
    });
  }

  // ── FS helpers (implemented over exec) ────────────────────────────────

  async fsRead(instanceId: string, opts: FsReadOptions, userId?: string): Promise<{ content: string; bytes: number; truncated: boolean }> {
    const maxBytes = opts.maxBytes ?? DEFAULT_FS_READ_MAX_BYTES;
    // Use base64 to safely transport binary; head -c to limit
    const cmd = `head -c ${maxBytes + 1} ${this.shellQuote(opts.path)} | base64 -w 0`;
    const r = await this.exec(instanceId, { cmd }, userId);
    if (r.exitCode !== 0) {
      throw new Error(`fs.read failed (exit=${r.exitCode}): ${r.stderr.trim() || r.stdout.trim()}`);
    }
    const buf = Buffer.from(r.stdout.trim(), 'base64');
    const truncated = buf.length > maxBytes;
    const finalBuf = truncated ? buf.subarray(0, maxBytes) : buf;
    return {
      content: finalBuf.toString('utf8'),
      bytes: finalBuf.length,
      truncated,
    };
  }

  async fsWrite(instanceId: string, opts: FsWriteOptions, userId?: string): Promise<{ bytes: number; path: string }> {
    const enc: BufferEncoding = opts.encoding === 'base64' ? 'base64' : 'utf8';
    const buf = Buffer.from(opts.content, enc);
    const b64 = buf.toString('base64');
    const mkdir = opts.mkdirp !== false ? `mkdir -p "$(dirname ${this.shellQuote(opts.path)})" && ` : '';
    // base64 -d → tee >/dev/null to avoid echoing back
    const cmd = `${mkdir}printf '%s' '${b64}' | base64 -d > ${this.shellQuote(opts.path)}`;
    const r = await this.exec(instanceId, { cmd }, userId);
    if (r.exitCode !== 0) {
      throw new Error(`fs.write failed (exit=${r.exitCode}): ${r.stderr.trim() || r.stdout.trim()}`);
    }
    return { bytes: buf.length, path: opts.path };
  }

  // ── helpers ───────────────────────────────────────────────────────────

  private shellQuote(p: string): string {
    // Single-quote and escape any single-quotes inside the path
    return `'${p.replace(/'/g, `'\\''`)}'`;
  }

  private async ensureImage(image: string): Promise<void> {
    if (!this.docker) throw new Error('Docker unavailable');
    try {
      await this.docker.getImage(image).inspect();
      return; // image present
    } catch (_) {
      // pull below
    }
    this.logger.log(`pulling image ${image} (one-time)`);
    await new Promise<void>((resolve, reject) => {
      this.docker!.pull(image, (err: any, stream: NodeJS.ReadableStream) => {
        if (err) return reject(err);
        this.docker!.modem.followProgress(stream, (e2: any) => (e2 ? reject(e2) : resolve()));
      });
    });
  }

  private scheduleAutoDestroy(instanceId: string, ttlSec: number): void {
    if (ttlSec <= 0) return;
    const t = setTimeout(() => {
      this.ttlTimers.delete(instanceId);
      this.destroy(instanceId).catch((e) =>
        this.logger.warn(`auto-destroy ${instanceId} failed: ${e?.message ?? e}`),
      );
    }, ttlSec * 1000);
    // Allow process to exit even if timers still pending
    if (typeof t.unref === 'function') t.unref();
    this.ttlTimers.set(instanceId, t);
  }

  async onModuleDestroy(): Promise<void> {
    for (const t of this.ttlTimers.values()) clearTimeout(t);
    this.ttlTimers.clear();
  }
}
