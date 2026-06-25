import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';
import {
  AgentTemplate,
  AgentTemplateVisibility,
} from '../../entities/agent-template.entity';
import { UserAgent, UserAgentStatus } from '../../entities/user-agent.entity';
import {
  CreateAgentTemplateDto,
  InstantiateAgentDto,
  UpdateAgentTemplateDto,
} from './dto/agent-template.dto';

interface TemplateQuery {
  search?: string;
  category?: string;
  tag?: string;
  visibility?: AgentTemplateVisibility;
  createdBy?: string;
}

@Injectable()
export class AgentTemplateService {
  constructor(
    @InjectRepository(AgentTemplate)
    private readonly templateRepository: Repository<AgentTemplate>,
    @InjectRepository(UserAgent)
    private readonly userAgentRepository: Repository<UserAgent>,
  ) {}

  async listTemplates(query: TemplateQuery, userId?: string) {
    const qb = this.templateRepository
      .createQueryBuilder('template')
      .orderBy('template.isFeatured', 'DESC')
      .addOrderBy('template.usageCount', 'DESC')
      .addOrderBy('template.created_at', 'DESC');

    if (query.category) {
      qb.andWhere('template.category = :category', { category: query.category });
    }

    if (query.visibility) {
      qb.andWhere('template.visibility = :visibility', { visibility: query.visibility });
    } else {
      qb.andWhere('template.visibility = :visibility', {
        visibility: AgentTemplateVisibility.PUBLIC,
      });
    }

    if (query.tag) {
      qb.andWhere(':tag = ANY(template.tags)', { tag: query.tag });
    }

    if (query.search) {
      qb.andWhere('template.name ILIKE :search', { search: `%${query.search}%` });
    }

    if (query.createdBy) {
      qb.andWhere('template.createdBy = :createdBy', { createdBy: query.createdBy });
    }

    const templates = await qb.getMany();

    if (!userId) {
      return templates;
    }

    return templates.filter(
      (template) =>
        template.visibility === AgentTemplateVisibility.PUBLIC ||
        template.createdBy === userId,
    );
  }

  async listMyTemplates(userId: string) {
    return this.templateRepository.find({
      where: [{ createdBy: userId }, { visibility: AgentTemplateVisibility.PUBLIC }],
      order: { updatedAt: 'DESC' },
    });
  }

  async createTemplate(userId: string, dto: CreateAgentTemplateDto) {
    const template = this.templateRepository.create({
      ...dto,
      tags: dto.tags || [],
      createdBy: userId,
    });
    return this.templateRepository.save(template);
  }

  async updateTemplate(userId: string, templateId: string, dto: UpdateAgentTemplateDto) {
    const template = await this.templateRepository.findOne({ where: { id: templateId } });
    if (!template) {
      throw new NotFoundException('模板不存在');
    }
    if (template.createdBy !== userId) {
      throw new ForbiddenException('无权修改该模板');
    }
    Object.assign(template, {
      ...dto,
      tags: dto.tags ?? template.tags,
    });
    return this.templateRepository.save(template);
  }

  async publishTemplate(userId: string, templateId: string) {
    const template = await this.templateRepository.findOne({ where: { id: templateId } });
    if (!template) {
      throw new NotFoundException('模板不存在');
    }
    if (template.createdBy !== userId) {
      throw new ForbiddenException('无权操作该模板');
    }
    template.visibility = AgentTemplateVisibility.PUBLIC;
    template.isFeatured = true;
    return this.templateRepository.save(template);
  }

  async instantiateTemplate(userId: string, dto: InstantiateAgentDto) {
    if (!dto.templateId) {
      throw new NotFoundException('模板ID不能为空');
    }

    // 检查 templateId 是否是有效的 UUID 格式
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const isUUID = uuidRegex.test(dto.templateId);

    let template;
    if (isUUID) {
      // 如果是 UUID，直接查询
      template = await this.templateRepository.findOne({
        where: [
          { id: dto.templateId, visibility: AgentTemplateVisibility.PUBLIC },
          { id: dto.templateId, createdBy: userId },
        ],
      });
    } else {
      // 如果不是 UUID，可能是 slug 或其他标识符，尝试通过 metadata 或其他字段查找
      // 或者返回错误提示
      throw new NotFoundException(`模板ID格式不正确。期望UUID格式，但收到: ${dto.templateId}。请确保使用正确的模板ID。`);
    }

    if (!template) {
      throw new NotFoundException('模板不可用或不存在');
    }

    const slug = await this.generateSlug(dto.name);

    const userAgent = this.userAgentRepository.create({
      userId,
      templateId: template.id,
      name: dto.name,
      description: dto.description || template.description,
      status: dto.publish ? UserAgentStatus.ACTIVE : UserAgentStatus.DRAFT,
      isPublished: !!dto.publish,
      slug,
      settings: {
        ...template.config,
        ...(dto.settings || {}),
      },
      metadata: {
        sourceTemplate: template.id,
        persona: template.persona,
      },
    });

    template.usageCount += 1;
    await this.templateRepository.save(template);

    return this.userAgentRepository.save(userAgent);
  }

  async listUserAgents(userId: string) {
    return this.userAgentRepository.find({
      where: { userId },
      order: { updatedAt: 'DESC' },
    });
  }

  private async generateSlug(name: string, attempt = 0): Promise<string> {
    const base = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '')
      .slice(0, 40);
    const slug = attempt === 0 ? base : `${base}-${attempt}`;
    const exists = await this.userAgentRepository.findOne({ where: { slug } });
    if (exists) {
      return this.generateSlug(name, attempt + 1);
    }
    return slug;
  }
}

