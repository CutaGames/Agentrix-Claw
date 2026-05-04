import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

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
  private templates = new Map<string, WorkflowTemplate>();
  private instances = new Map<string, WorkflowInstance>();

  private genId(prefix: string) {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  createTemplate(userId: string, body: {
    name: string;
    description?: string;
    category?: WorkflowTemplate['category'];
    steps: Array<Omit<WorkflowStep, 'id'>>;
    required_skills?: string[];
    visibility?: WorkflowTemplate['visibility'];
  }): WorkflowTemplate {
    if (!body?.name) throw new BadRequestException('name required');
    if (!body.steps || body.steps.length === 0) throw new BadRequestException('steps required');

    const tpl: WorkflowTemplate = {
      id: this.genId('wf'),
      authorUserId: userId,
      name: body.name,
      description: body.description || '',
      category: body.category || 'other',
      steps: body.steps.map((s, idx) => ({
        ...s,
        id: `s${idx}`,
      })),
      required_skills: body.required_skills || [],
      visibility: body.visibility || 'private',
      install_count: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.templates.set(tpl.id, tpl);
    return tpl;
  }

  listTemplates(userId: string, filter?: { category?: string; visibility?: string }): WorkflowTemplate[] {
    let arr = Array.from(this.templates.values()).filter(
      (t) => t.visibility === 'public' || t.authorUserId === userId,
    );
    if (filter?.category) arr = arr.filter((t) => t.category === filter.category);
    if (filter?.visibility) arr = arr.filter((t) => t.visibility === filter.visibility);
    return arr.sort((a, b) => b.install_count - a.install_count);
  }

  getTemplate(id: string): WorkflowTemplate {
    const t = this.templates.get(id);
    if (!t) throw new NotFoundException('template not found');
    return t;
  }

  install(userId: string, templateId: string): WorkflowInstance {
    const tpl = this.getTemplate(templateId);
    tpl.install_count += 1;

    const inst: WorkflowInstance = {
      id: this.genId('wfi'),
      templateId,
      userId,
      status: 'queued',
      currentStep: 0,
      results: [],
    };
    this.instances.set(inst.id, inst);
    setTimeout(() => this.runAsync(inst.id), 10);
    return inst;
  }

  private async runAsync(instId: string) {
    const inst = this.instances.get(instId);
    if (!inst) return;
    const tpl = this.templates.get(inst.templateId);
    if (!tpl) {
      inst.status = 'failed';
      return;
    }
    inst.status = 'running';
    inst.startedAt = Date.now();
    try {
      for (let i = 0; i < tpl.steps.length; i++) {
        const step = tpl.steps[i];
        inst.currentStep = i;
        await new Promise((r) => setTimeout(r, 30));
        inst.results.push({
          step_id: step.id,
          status: 'done',
          result: `[mock] ${step.kind} executed: ${step.description}`,
        });
      }
      inst.status = 'done';
      inst.finishedAt = Date.now();
    } catch (e: any) {
      inst.status = 'failed';
      inst.finishedAt = Date.now();
    }
  }

  getInstance(id: string): WorkflowInstance {
    const i = this.instances.get(id);
    if (!i) throw new NotFoundException('instance not found');
    return i;
  }

  listInstances(userId: string): WorkflowInstance[] {
    return Array.from(this.instances.values())
      .filter((i) => i.userId === userId)
      .sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0));
  }
}
