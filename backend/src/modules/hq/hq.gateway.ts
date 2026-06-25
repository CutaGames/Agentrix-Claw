import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { HqService, DashboardAlert, AgentStatusInfo } from './hq.service';

/**
 * HQ WebSocket Gateway (Phase 4 - Automation)
 * 
 * 提供实时推送能力：
 * - 系统告警实时通知
 * - Agent 状态变更
 * - Dashboard KPI 实时更新
 * - 自动化任务进度
 */
@WebSocketGateway({
  namespace: '/hq',
  cors: {
    origin: ['http://localhost:3000', 'http://localhost:4000', 'http://localhost:4001'],
    credentials: true,
  },
})
export class HqGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(HqGateway.name);

  @WebSocketServer()
  server: Server;

  constructor(private readonly hqService: HqService) {}

  afterInit(server: Server) {
    this.logger.log('HQ WebSocket Gateway initialized');
    
    // Start periodic updates for connected clients
    this.startPeriodicUpdates();
  }

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
    
    // Send initial data on connection
    this.sendInitialData(client);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  /**
   * 发送初始数据给新连接的客户端
   */
  private async sendInitialData(client: Socket) {
    try {
      const [stats, alerts, agents] = await Promise.all([
        this.hqService.getDashboardStats(),
        this.hqService.getDashboardAlerts(5),
        this.hqService.getAgentStatuses(),
      ]);

      client.emit('dashboard:stats', stats);
      client.emit('dashboard:alerts', alerts);
      client.emit('agents:status', agents);
    } catch (error) {
      this.logger.error('Failed to send initial data', error);
    }
  }

  /**
   * 启动周期性更新（模拟实时数据）
   */
  private startPeriodicUpdates() {
    // Update dashboard stats every 30 seconds
    setInterval(async () => {
      try {
        const sockets = await this.server.fetchSockets();
        if (this.server && sockets.length > 0) {
          const stats = await this.hqService.getDashboardStats();
          this.server.emit('dashboard:stats', stats);
        }
      } catch (error) {
        this.logger.debug('No clients connected for dashboard stats update');
      }
    }, 30000);

    // Update agent statuses every 10 seconds
    setInterval(async () => {
      try {
        const sockets = await this.server.fetchSockets();
        if (this.server && sockets.length > 0) {
          const agents = await this.hqService.getAgentStatuses();
          this.server.emit('agents:status', agents);
        }
      } catch (error) {
        this.logger.debug('No clients connected for agent status update');
      }
    }, 10000);
  }

  /**
   * 广播新告警给所有连接的客户端
   */
  broadcastAlert(alert: DashboardAlert) {
    this.logger.log(`Broadcasting alert: ${alert.title}`);
    this.server.emit('alert:new', alert);
  }

  /**
   * 广播 Agent 状态更新
   */
  broadcastAgentUpdate(agent: AgentStatusInfo) {
    this.logger.log(`Broadcasting agent update: ${agent.id} - ${agent.status}`);
    this.server.emit('agent:update', agent);
  }

  /**
   * 广播任务进度更新
   */
  broadcastTaskProgress(taskId: string, progress: number, message?: string) {
    this.server.emit('task:progress', { taskId, progress, message });
  }

  // ========== Client Message Handlers ==========

  @SubscribeMessage('subscribe:alerts')
  handleSubscribeAlerts(@ConnectedSocket() client: Socket) {
    this.logger.log(`Client ${client.id} subscribed to alerts`);
    client.join('alerts');
    return { success: true };
  }

  @SubscribeMessage('subscribe:agents')
  handleSubscribeAgents(@ConnectedSocket() client: Socket) {
    this.logger.log(`Client ${client.id} subscribed to agents`);
    client.join('agents');
    return { success: true };
  }

  @SubscribeMessage('agent:command')
  async handleAgentCommand(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { agentId: string; command: string },
  ) {
    this.logger.log(`Received command for agent ${data.agentId}: ${data.command}`);
    const result = await this.hqService.sendAgentCommand(data.agentId, data.command);
    
    // Broadcast the agent status update
    const agent = await this.hqService.getAgentDetail(data.agentId);
    if (agent) {
      this.broadcastAgentUpdate(agent);
    }

    return result;
  }

  @SubscribeMessage('ping')
  handlePing(@ConnectedSocket() client: Socket) {
    return { event: 'pong', timestamp: new Date().toISOString() };
  }
}
