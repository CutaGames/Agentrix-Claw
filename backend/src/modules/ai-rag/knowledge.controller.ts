/**
 * KnowledgeController — Layer 1: User Knowledge Base Management
 * Provides CRUD for knowledge files backing the ai-rag AiRagService.
 * Files are stored at: {cwd}/knowledge/{userId}/
 * Workspace files:     {cwd}/knowledge/workspace/{workspaceId}/
 *
 * POST   /api/ai-rag/knowledge                          — upload/create a knowledge file
 * GET    /api/ai-rag/knowledge                          — list files
 * DELETE /api/ai-rag/knowledge/:id                     — delete a file
 * GET    /api/ai-rag/knowledge/workspace/:workspaceId  — list workspace knowledge
 * POST   /api/ai-rag/knowledge/workspace/:workspaceId  — upload workspace knowledge
 * DELETE /api/ai-rag/knowledge/workspace/:workspaceId/:id — delete workspace knowledge file
 */
import {
  Controller, Get, Post, Delete, Param, Body,
  UseGuards, Request, HttpCode, HttpStatus, Logger,
  ForbiddenException, BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import * as fs from 'fs';
import * as path from 'path';

interface KnowledgeFileMeta {
  id: string;       // base64 of relative path
  fileName: string;
  sizeBytes: number;
  chunks: number;   // approximate: ⌈sizeBytes / 800⌉
  createdAt: string;
}

@ApiTags('Knowledge (RAG)')
@Controller('ai-rag/knowledge')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class KnowledgeController {
  private readonly logger = new Logger(KnowledgeController.name);
  private readonly baseDir = path.join(process.cwd(), 'knowledge');

  private userDir(userId: string): string {
    const dir = path.join(this.baseDir, userId);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  private workspaceDir(workspaceId: string): string {
    // Permit only safe chars in workspaceId to prevent path traversal
    const safe = workspaceId.replace(/[^a-zA-Z0-9_-]/g, '');
    if (!safe) throw new BadRequestException('Invalid workspaceId');
    const dir = path.join(this.baseDir, 'workspace', safe);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  private encodeId(userId: string, fileName: string): string {
    return Buffer.from(`${userId}/${fileName}`).toString('base64url');
  }

  private decodeId(id: string): { userId: string; fileName: string } {
    const decoded = Buffer.from(id, 'base64url').toString('utf-8');
    const idx = decoded.indexOf('/');
    return {
      userId: decoded.slice(0, idx),
      fileName: decoded.slice(idx + 1),
    };
  }

  private encodeWorkspaceId(workspaceId: string, fileName: string): string {
    return Buffer.from(`workspace/${workspaceId}/${fileName}`).toString('base64url');
  }

  private decodeWorkspaceId(id: string): { workspaceId: string; fileName: string } {
    const decoded = Buffer.from(id, 'base64url').toString('utf-8');
    const parts = decoded.split('/');
    // expected: workspace/{workspaceId}/{fileName}
    if (parts.length < 3 || parts[0] !== 'workspace') {
      throw new BadRequestException('Invalid workspace knowledge file id');
    }
    return { workspaceId: parts[1], fileName: parts.slice(2).join('/') };
  }

  private listDir(dir: string, workspaceId: string | null, userId: string | null): KnowledgeFileMeta[] {
    let files: string[];
    try {
      files = fs.readdirSync(dir).filter((f) => f.endsWith('.md') || f.endsWith('.txt'));
    } catch {
      return [];
    }
    return files.map((f) => {
      const fp = path.join(dir, f);
      const stat = fs.statSync(fp);
      const id = workspaceId
        ? this.encodeWorkspaceId(workspaceId, f)
        : this.encodeId(userId!, f);
      return {
        id,
        fileName: f,
        sizeBytes: stat.size,
        chunks: Math.ceil(stat.size / 800),
        createdAt: stat.birthtime.toISOString(),
      };
    });
  }

  @Get()
  @ApiOperation({ summary: 'List knowledge files for the current user' })
  list(@Request() req: any): KnowledgeFileMeta[] {
    const dir = this.userDir(req.user.id);
    return this.listDir(dir, null, req.user.id);
  }

  @Post()
  @ApiOperation({ summary: 'Create / upload a knowledge file' })
  create(
    @Request() req: any,
    @Body() body: { fileName: string; content: string },
  ): KnowledgeFileMeta {
    const { fileName, content } = body;
    if (!fileName || !content) {
      throw new Error('fileName and content are required');
    }
    // Sanitise filename — allow only alphanumeric, dash, underscore, dot
    const safe = fileName.replace(/[^a-zA-Z0-9._\-]/g, '_');
    const dir = this.userDir(req.user.id);
    const fp = path.join(dir, safe);
    fs.writeFileSync(fp, content, 'utf-8');
    const stat = fs.statSync(fp);
    this.logger.log(`Knowledge file created: ${fp} (${stat.size} bytes)`);

    return {
      id: this.encodeId(req.user.id, safe),
      fileName: safe,
      sizeBytes: stat.size,
      chunks: Math.ceil(stat.size / 800),
      createdAt: stat.birthtime.toISOString(),
    };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a knowledge file' })
  remove(@Param('id') id: string, @Request() req: any): void {
    const { userId, fileName } = this.decodeId(id);
    if (userId !== req.user.id) {
      throw new Error('Forbidden');
    }
    const fp = path.join(this.userDir(req.user.id), fileName);
    if (fs.existsSync(fp)) {
      fs.unlinkSync(fp);
      this.logger.log(`Knowledge file deleted: ${fp}`);
    }
  }
}
