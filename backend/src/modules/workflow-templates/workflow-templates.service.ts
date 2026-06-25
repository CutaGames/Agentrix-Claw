import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WorkflowInstanceEntity } from '../../entities/workflow-instance.entity';
import { WorkflowTemplateEntity } from '../../entities/workflow-template.entity';

/**
 * 顿领 §10.3 联合工作流模板 (P2-8 第二部分)
 * In-memory MVP.
 */

export interface WorkflowStep {
  id: string;
  kind: 'fetch' | 'compose' | 'send' | 'sign' | 'pay' | 'invoke';
  description: string;
  agent_role?: string; // e.g. 'researcher' | 'composer' | 'approver'
  params?: Record<string, any>;
}

export interface WorkflowTemplate {
  id: string;
  authorUserId: string;
  name: string;
  description: string;
  category: 'productivity' | 'finance' | 'social' | 'wellness' | 'devops' | 'other';
  steps: WorkflowStep[];
  required_skills: string[];
  visibility: 'private' | 'team' | 'public';
  install_count: number;
  createdAt: number;
  updatedAt: number;
}

export interface WorkflowInstance {
  id: string;
  templateId: string;
  userId: string;
  status: 'queued' | 'running' | 'done' | 'failed';
  currentStep: number;
  startedAt?: number;
  finishedAt?: number;
  results: Array<{ step_id: string; status: string; result?: string }>;
}

@Injectable()
export class WorkflowTemplatesService {
  constructor(
    @InjectRepository(WorkflowTemplateEntity)
    private readonly templateRepo: Repository<WorkflowTemplateEntity>,
    @InjectRepository(WorkflowInstanceEntity)
    private readonly instanceRepo: Repository<WorkflowInstanceEntity>,
  ) {}

  private genId(prefix: string) {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  async createTemplate(userId: string, body: {
    name: string;
    description?: string;
    category?: WorkflowTemplate['category'];
    steps: Array<Omit<WorkflowStep, 'id'>>;
    required_skills?: string[];
    visibility?: WorkflowTemplate['visibility'];
  }): Promise<WorkflowTemplate> {
    if (!body?.name) throw new BadRequestException('name required');
    if (!body.steps || body.steps.length === 0) throw new BadRequestException('steps required');

    const now = Date.now();

    const tpl = this.templateRepo.create({
      id: this.genId('wf'),
      authorUserId: userId,
      name: body.name,
      description: body.description || '',
      category: body.category || 'other',
      steps: body.steps.map((s, idx) => ({
        ...s,
        id: `s${idx}`,
      })),
      requiredSkills: body.required_skills || [],
      visibility: body.visibility || 'private',
      installCount: 0,
      createdAtMs: String(now),
      updatedAtMs: String(now),
    });
    const saved = await this.templateRepo.save(tpl);
    return this.toTemplate(saved);
  }

  async listTemplates(userId: string, filter?: { category?: string; visibility?: string }): Promise<WorkflowTemplate[]> {
    let arr = (await this.templateRepo.find()).map((row) => this.toTemplate(row)).filter(
      (t) => t.visibility === 'public' || t.authorUserId === userId,
    );
    if (filter?.category) arr = arr.filter((t) => t.category === filter.category);
    if (filter?.visibility) arr = arr.filter((t) => t.visibility === filter.visibility);
    return arr.sort((a, b) => b.install_count - a.install_count);
  }

  async getTemplate(id: string): Promise<WorkflowTemplate> {
    const row = await this.templateRepo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('template not found');
    return this.toTemplate(row);
  }

  async install(userId: string, templateId: string): Promise<WorkflowInstance> {
    const tpl = await this.templateRepo.findOne({ where: { id: templateId } });
    if (!tpl) throw new NotFoundException('template not found');
    tpl.installCount += 1;
    tpl.updatedAtMs = String(Date.now());
    await this.templateRepo.save(tpl);

    const inst = this.instanceRepo.create({
      id: this.genId('wfi'),
      templateId,
      userId,
      status: 'queued',
      currentStep: 0,
      results: [],
    });
    const saved = await this.instanceRepo.save(inst);
    setTimeout(() => {
      void this.runAsync(saved.id);
    }, 10);
    return this.toInstance(saved);
  }

  private async runAsync(instId: string) {
    const inst = await this.instanceRepo.findOne({ where: { id: instId } });
    if (!inst) return;
    const tpl = await this.templateRepo.findOne({ where: { id: inst.templateId } });
    if (!tpl) {
      inst.status = 'failed';
      inst.finishedAtMs = String(Date.now());
      await this.instanceRepo.save(inst);
      return;
    }
    inst.status = 'running';
    inst.startedAtMs = String(Date.now());
    await this.instanceRepo.save(inst);

    try {
      for (let i = 0; i < tpl.steps.length; i++) {
        const step = tpl.steps[i];
        inst.currentStep = i;
        await this.instanceRepo.save(inst);
        await new Promise((r) => setTimeout(r, 5));
        inst.results = [
          ...(inst.results ?? []),
          {
          step_id: step.id,
          status: 'done',
          result: `[mock] ${step.kind} executed: ${step.description}`,
          },
        ];
        await this.instanceRepo.save(inst);
      }
      inst.status = 'done';
      inst.finishedAtMs = String(Date.now());
      await this.instanceRepo.save(inst);
    } catch (e: any) {
      inst.status = 'failed';
      inst.finishedAtMs = String(Date.now());
      await this.instanceRepo.save(inst);
    }
  }

  async getInstance(id: string): Promise<WorkflowInstance> {
    const row = await this.instanceRepo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('instance not found');
    return this.toInstance(row);
  }

  async listInstances(userId: string): Promise<WorkflowInstance[]> {
    const rows = await this.instanceRepo.find({
      where: { userId },
      order: { startedAtMs: 'DESC' },
    });
    return rows.map((row) => this.toInstance(row)).sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0));
  }

  private toTemplate(row: WorkflowTemplateEntity): WorkflowTemplate {
    return {
      id: row.id,
      authorUserId: row.authorUserId,
      name: row.name,
      description: row.description,
      category: row.category as WorkflowTemplate['category'],
      steps: row.steps.map((step) => ({
        ...step,
        kind: step.kind as WorkflowStep['kind'],
      })),
      required_skills: row.requiredSkills ?? [],
      visibility: row.visibility as WorkflowTemplate['visibility'],
      install_count: row.installCount,
      createdAt: Number(row.createdAtMs),
      updatedAt: Number(row.updatedAtMs),
    };
  }

  private toInstance(row: WorkflowInstanceEntity): WorkflowInstance {
    return {
      id: row.id,
      templateId: row.templateId,
      userId: row.userId,
      status: row.status as WorkflowInstance['status'],
      currentStep: row.currentStep,
      startedAt: row.startedAtMs ? Number(row.startedAtMs) : undefined,
      finishedAt: row.finishedAtMs ? Number(row.finishedAtMs) : undefined,
      results: row.results ?? [],
    };
  }
}
