import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { ReconstructionService } from '../reconstruction/reconstruction.service';

/**
 * JobProgressGateway — Real-time WebSocket gateway for job progress events.
 *
 * Namespace: /world-engine/jobs
 *
 * Clients join a room by jobId to receive progress updates.
 * Events emitted:
 *   - 'progress' — { jobId, progress (0-100) }
 *   - 'complete' — { jobId, result }
 *   - 'error'    — { jobId, message }
 *
 * @see design.md — WebSocket /api/v1/world-engine/jobs/:jobId/stream
 */
@WebSocketGateway({
  namespace: '/world-engine/jobs',
  cors: {
    origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000'],
    credentials: true,
  },
})
export class JobProgressGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(JobProgressGateway.name);

  /** Track polling intervals per socket for cleanup */
  private readonly socketPollers = new Map<string, Map<string, NodeJS.Timeout>>();

  @WebSocketServer()
  server: Server;

  constructor(private readonly reconstructionService: ReconstructionService) {}

  handleConnection(client: Socket) {
    this.logger.log(`Client connected to job-progress: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected from job-progress: ${client.id}`);
    // Clean up all pollers for this socket
    const pollers = this.socketPollers.get(client.id);
    if (pollers) {
      for (const interval of pollers.values()) {
        clearInterval(interval);
      }
      this.socketPollers.delete(client.id);
    }
  }

  /**
   * Client subscribes to a specific job's progress updates.
   * The client joins a room named after the jobId and receives periodic updates.
   */
  @SubscribeMessage('subscribe')
  async handleSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { jobId: string },
  ) {
    const { jobId } = data;
    if (!jobId) {
      return { event: 'error', data: { message: 'jobId is required' } };
    }

    // Join the job-specific room
    client.join(`job:${jobId}`);
    this.logger.log(`Client ${client.id} subscribed to job ${jobId}`);

    // Send current status immediately
    const currentStatus = await this.reconstructionService.getJobStatus(jobId);
    if (currentStatus.status === 'completed') {
      client.emit('complete', { jobId, result: currentStatus.result });
    } else if (currentStatus.status === 'failed') {
      client.emit('error', { jobId, message: currentStatus.error || 'Job failed' });
    } else {
      client.emit('progress', { jobId, progress: currentStatus.progress });

      // Start polling for updates (every 2 seconds)
      this.startPolling(client, jobId);
    }

    return { event: 'subscribed', data: { jobId } };
  }

  /**
   * Client unsubscribes from a job's progress updates.
   */
  @SubscribeMessage('unsubscribe')
  handleUnsubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { jobId: string },
  ) {
    const { jobId } = data;
    if (!jobId) {
      return { event: 'error', data: { message: 'jobId is required' } };
    }

    client.leave(`job:${jobId}`);
    this.stopPolling(client.id, jobId);
    this.logger.log(`Client ${client.id} unsubscribed from job ${jobId}`);

    return { event: 'unsubscribed', data: { jobId } };
  }

  /**
   * Broadcast a progress update to all clients watching a specific job.
   * Can be called externally by the ReconstructionProcessor.
   */
  broadcastProgress(jobId: string, progress: number) {
    this.server.to(`job:${jobId}`).emit('progress', { jobId, progress });
  }

  /**
   * Broadcast job completion to all clients watching a specific job.
   */
  broadcastComplete(jobId: string, result: Record<string, any>) {
    this.server.to(`job:${jobId}`).emit('complete', { jobId, result });
  }

  /**
   * Broadcast job error to all clients watching a specific job.
   */
  broadcastError(jobId: string, message: string) {
    this.server.to(`job:${jobId}`).emit('error', { jobId, message });
  }

  // ── Private Helpers ──────────────────────────────────────────────────────

  /**
   * Start polling job status for a client.
   * Polls every 2 seconds and emits updates until job completes or fails.
   */
  private startPolling(client: Socket, jobId: string) {
    if (!this.socketPollers.has(client.id)) {
      this.socketPollers.set(client.id, new Map());
    }

    const pollers = this.socketPollers.get(client.id)!;

    // Don't create duplicate pollers for the same job
    if (pollers.has(jobId)) return;

    const interval = setInterval(async () => {
      try {
        const status = await this.reconstructionService.getJobStatus(jobId);

        switch (status.status) {
          case 'processing':
          case 'queued':
            this.server.to(`job:${jobId}`).emit('progress', {
              jobId,
              progress: status.progress,
            });
            break;

          case 'completed':
            this.server.to(`job:${jobId}`).emit('complete', {
              jobId,
              result: status.result,
            });
            this.stopPolling(client.id, jobId);
            break;

          case 'failed':
          case 'timeout':
            this.server.to(`job:${jobId}`).emit('error', {
              jobId,
              message: status.error || 'Job failed',
            });
            this.stopPolling(client.id, jobId);
            break;
        }
      } catch (err) {
        this.logger.error(`Error polling job ${jobId}: ${err}`);
      }
    }, 2000);

    pollers.set(jobId, interval);
  }

  /**
   * Stop polling for a specific job on a specific socket.
   */
  private stopPolling(socketId: string, jobId: string) {
    const pollers = this.socketPollers.get(socketId);
    if (pollers) {
      const interval = pollers.get(jobId);
      if (interval) {
        clearInterval(interval);
        pollers.delete(jobId);
      }
      if (pollers.size === 0) {
        this.socketPollers.delete(socketId);
      }
    }
  }
}
