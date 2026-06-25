import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum McpTransport {
  STDIO = 'stdio',
  SSE = 'sse',
  HTTP = 'http', // Streamable HTTP (JSON-RPC POST + SSE GET)
}

export enum McpServerStatus {
  CONNECTED = 'connected',
  DISCONNECTED = 'disconnected',
  ERROR = 'error',
  CONNECTING = 'connecting',
}

@Entity('mcp_servers')
@Index(['userId'])
export class McpServer {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column({ length: 150 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'enum', enum: McpTransport })
  transport: McpTransport;

  @Column({ type: 'text', nullable: true })
  url?: string; // For SSE/HTTP transport

  @Column({ type: 'text', nullable: true })
  command?: string; // For stdio transport (e.g. "npx -y @modelcontextprotocol/server-filesystem")

  @Column({ type: 'text', array: true, default: '{}' })
  args?: string[]; // For stdio transport arguments

  @Column({ type: 'jsonb', nullable: true })
  env?: Record<string, string>; // Environment variables for stdio

  @Column({ type: 'jsonb', nullable: true })
  auth?: {
    type?: 'bearer' | 'oauth2' | 'api_key';
    token?: string;
    clientId?: string;
    clientSecret?: string;
    authUrl?: string;
    tokenUrl?: string;
    scopes?: string[];
  };

  @Column({ type: 'jsonb', nullable: true })
  discoveredTools?: Array<{
    name: string;
    description?: string;
    inputSchema?: Record<string, any>;
  }>;

  @Column({ type: 'int', default: 0 })
  toolCount: number;

  @Column({ type: 'enum', enum: McpServerStatus, default: McpServerStatus.DISCONNECTED })
  status: McpServerStatus;

  @Column({ type: 'text', nullable: true })
  lastError?: string;

  @Column({ type: 'timestamp', nullable: true })
  lastConnectedAt?: Date;

  @Column({ default: true })
  isEnabled: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
