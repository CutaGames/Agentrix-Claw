import {
  IsArray,
  IsEnum,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsBoolean,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export enum DesktopTaskStatus {
  IDLE = 'idle',
  EXECUTING = 'executing',
  NEED_APPROVE = 'need-approve',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export enum DesktopTimelineStatus {
  RUNNING = 'running',
  WAITING_APPROVAL = 'waiting-approval',
  COMPLETED = 'completed',
  FAILED = 'failed',
  REJECTED = 'rejected',
}

export enum DesktopApprovalRiskLevel {
  L0 = 'L0',
  L1 = 'L1',
  L2 = 'L2',
  L3 = 'L3',
}

export enum DesktopApprovalDecision {
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

export enum DesktopSessionDeviceType {
  DESKTOP = 'desktop',
  MOBILE = 'mobile',
  WEB = 'web',
}

export enum DesktopCommandKind {
  CONTEXT = 'context',
  ACTIVE_WINDOW = 'active-window',
  LIST_WINDOWS = 'list-windows',
  LIST_DIRECTORY = 'list-directory',
  RUN_COMMAND = 'run-command',
  READ_FILE = 'read-file',
  WRITE_FILE = 'write-file',
  OPEN_BROWSER = 'open-browser',
  // Computer Use (Phase B) — direct mouse/keyboard/screen control + browser CDP.
  // The desktop client invokes the corresponding Tauri command and returns the
  // result. CLICK / TYPE / KEY are L2 (require approval); SCREENSHOT /
  // WINDOW_TREE / browser READ-ONLY ops are L0; BROWSER_NAVIGATE / EVAL /
  // CLICK_SELECTOR are L1 (host-scoped session approval).
  CU_SCREENSHOT = 'computer-use-screenshot',
  CU_CLICK = 'computer-use-click',
  CU_MOVE = 'computer-use-move',
  CU_TYPE = 'computer-use-type',
  CU_KEY = 'computer-use-key',
  CU_WINDOW_TREE = 'computer-use-window-tree',
  CU_BROWSER_NAVIGATE = 'computer-use-browser-navigate',
  CU_BROWSER_LIST_TABS = 'computer-use-browser-list-tabs',
  CU_BROWSER_EVAL = 'computer-use-browser-eval',
  CU_BROWSER_CLICK_SELECTOR = 'computer-use-browser-click-selector',
  // World Creation (v6) — a Tier_C creation task dispatched off Mobile to a
  // bound desktop. The desktop client opens the Tier_C creator for the Plot.
  WORLD_CREATION_TASK = 'world-creation-task',
}

export enum DesktopCommandStatus {
  PENDING = 'pending',
  CLAIMED = 'claimed',
  COMPLETED = 'completed',
  FAILED = 'failed',
  REJECTED = 'rejected',
}

export class DesktopContextDto {
  @ApiPropertyOptional({ description: 'Foreground app/window title' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  activeWindowTitle?: string;

  @ApiPropertyOptional({ description: 'Foreground process name' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  processName?: string;

  @ApiPropertyOptional({ description: 'Workspace or project hint' })
  @IsOptional()
  @IsString()
  @MaxLength(240)
  workspaceHint?: string;

  @ApiPropertyOptional({ description: 'Current file hint' })
  @IsOptional()
  @IsString()
  @MaxLength(240)
  fileHint?: string;

  @ApiPropertyOptional({ description: 'Clipboard text preview' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  clipboardTextPreview?: string;
}

export class DesktopHeartbeatDto {
  @ApiProperty({ description: 'Stable local desktop device id' })
  @IsString()
  @MaxLength(120)
  deviceId: string;

  @ApiProperty({ description: 'Client platform', example: 'windows' })
  @IsString()
  @MaxLength(40)
  platform: string;

  @ApiPropertyOptional({ description: 'Desktop app version' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  appVersion?: string;

  @ApiPropertyOptional({ description: 'Current lightweight desktop context snapshot', type: DesktopContextDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => DesktopContextDto)
  context?: DesktopContextDto;
}

export class DesktopTimelineEntryDto {
  @ApiProperty()
  @IsString()
  @MaxLength(120)
  id: string;

  @ApiProperty()
  @IsString()
  @MaxLength(180)
  title: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  detail?: string;

  @ApiProperty()
  @IsString()
  @MaxLength(80)
  kind: string;

  @ApiProperty({ enum: DesktopApprovalRiskLevel })
  @IsEnum(DesktopApprovalRiskLevel)
  riskLevel: DesktopApprovalRiskLevel;

  @ApiProperty({ enum: DesktopTimelineStatus })
  @IsEnum(DesktopTimelineStatus)
  status: DesktopTimelineStatus;

  @ApiProperty()
  @IsNumber()
  startedAt: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  finishedAt?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  output?: string;
}

export class UpsertDesktopTaskDto {
  @ApiProperty()
  @IsString()
  @MaxLength(120)
  deviceId: string;

  @ApiProperty()
  @IsString()
  @MaxLength(120)
  taskId: string;

  @ApiProperty()
  @IsString()
  @MaxLength(180)
  title: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  summary?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  sessionId?: string;

  @ApiProperty({ enum: DesktopTaskStatus })
  @IsEnum(DesktopTaskStatus)
  status: DesktopTaskStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  startedAt?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  finishedAt?: number;

  @ApiPropertyOptional({ type: [DesktopTimelineEntryDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DesktopTimelineEntryDto)
  timeline?: DesktopTimelineEntryDto[];

  @ApiPropertyOptional({ type: DesktopContextDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => DesktopContextDto)
  context?: DesktopContextDto;
}

export class CreateDesktopApprovalDto {
  @ApiProperty()
  @IsString()
  @MaxLength(120)
  deviceId: string;

  @ApiProperty()
  @IsString()
  @MaxLength(120)
  taskId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  timelineEntryId?: string;

  @ApiProperty()
  @IsString()
  @MaxLength(180)
  title: string;

  @ApiProperty()
  @IsString()
  @MaxLength(1000)
  description: string;

  @ApiProperty({ enum: DesktopApprovalRiskLevel })
  @IsEnum(DesktopApprovalRiskLevel)
  riskLevel: DesktopApprovalRiskLevel;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  sessionKey?: string;

  @ApiPropertyOptional({ type: DesktopContextDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => DesktopContextDto)
  context?: DesktopContextDto;
}

export class RespondDesktopApprovalDto {
  @ApiProperty({ enum: DesktopApprovalDecision })
  @IsEnum(DesktopApprovalDecision)
  decision: DesktopApprovalDecision;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  deviceId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  rememberForSession?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class DesktopSessionMessageDto {
  @ApiProperty()
  @IsString()
  @MaxLength(40)
  role: string;

  @ApiProperty()
  @IsString()
  @MaxLength(12000)
  content: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @IsObject({ each: true })
  attachments?: Record<string, unknown>[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  streaming?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  error?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  createdAt?: number;
}

export class UpsertDesktopSessionDto {
  @ApiProperty()
  @IsString()
  @MaxLength(120)
  deviceId: string;

  @ApiProperty({ enum: DesktopSessionDeviceType })
  @IsEnum(DesktopSessionDeviceType)
  deviceType: DesktopSessionDeviceType;

  @ApiProperty()
  @IsString()
  @MaxLength(120)
  sessionId: string;

  @ApiProperty()
  @IsString()
  @MaxLength(180)
  title: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  updatedAt?: number;

  @ApiProperty({ type: [DesktopSessionMessageDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DesktopSessionMessageDto)
  messages: DesktopSessionMessageDto[];
}

export class CreateDesktopCommandDto {
  @ApiProperty()
  @IsString()
  @MaxLength(180)
  title: string;

  @ApiProperty({ enum: DesktopCommandKind })
  @IsEnum(DesktopCommandKind)
  kind: DesktopCommandKind;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  targetDeviceId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  requesterDeviceId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  sessionId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;
}

export class ClaimDesktopCommandDto {
  @ApiProperty()
  @IsString()
  @MaxLength(120)
  deviceId: string;
}

export class CompleteDesktopCommandDto {
  @ApiProperty()
  @IsString()
  @MaxLength(120)
  deviceId: string;

  @ApiProperty({ enum: DesktopCommandStatus })
  @IsEnum(DesktopCommandStatus)
  status: DesktopCommandStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  result?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  error?: string;
}

// ─── P8.3: Device Media Transfer DTOs ────────────────────

export class UploadDeviceMediaDto {
  @ApiProperty()
  @IsString()
  @MaxLength(120)
  sourceDeviceId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  targetDeviceId?: string;

  @ApiProperty({ description: 'Media type: photo, screenshot, file, gps' })
  @IsString()
  @MaxLength(50)
  mediaType: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  fileName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  mimeType?: string;

  @ApiPropertyOptional({ description: 'Base64 data URL for small payloads (<2MB)' })
  @IsOptional()
  @IsString()
  dataUrl?: string;

  @ApiPropertyOptional({ description: 'GPS coords, image dimensions, etc.' })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  sessionId?: string;
}

// ─── P8.4: Shared Workspace DTOs ─────────────────────────

export enum SharedWorkspaceRoleDto {
  OWNER = 'owner',
  EDITOR = 'editor',
  VIEWER = 'viewer',
}

export class CreateSharedWorkspaceDto {
  @ApiProperty()
  @IsString()
  @MaxLength(200)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;
}

export class InviteToWorkspaceDto {
  @ApiProperty({ description: 'User ID to invite' })
  @IsString()
  @MaxLength(120)
  userId: string;

  @ApiPropertyOptional({ enum: SharedWorkspaceRoleDto, default: SharedWorkspaceRoleDto.VIEWER })
  @IsOptional()
  @IsEnum(SharedWorkspaceRoleDto)
  role?: SharedWorkspaceRoleDto;
}

export class RespondWorkspaceInviteDto {
  @ApiProperty({ description: 'accept or decline' })
  @IsString()
  @MaxLength(10)
  action: 'accept' | 'decline';
}

export class ShareSessionToWorkspaceDto {
  @ApiProperty()
  @IsString()
  @MaxLength(120)
  sessionId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;
}

export class DeviceCapabilityDto {
  @ApiProperty()
  @IsString()
  @MaxLength(120)
  deviceId: string;

  @ApiProperty({ description: 'Capability names this device supports' })
  @IsArray()
  @IsString({ each: true })
  capabilities: string[];

  @ApiPropertyOptional({ description: 'GPS coordinates if available' })
  @IsOptional()
  @IsObject()
  gps?: { lat: number; lng: number; accuracy?: number; altitude?: number };

  @ApiPropertyOptional({ description: 'Device sensors available' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  sensors?: string[];
}