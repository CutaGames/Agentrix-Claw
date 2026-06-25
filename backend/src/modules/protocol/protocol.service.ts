import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Skill } from '../../entities/skill.entity';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ProtocolService {
  constructor(
    @InjectRepository(Skill)
    private skillRepository: Repository<Skill>,
    private configService: ConfigService,
  ) {}

  private getBaseUrl(): string {
    return this.configService.get('API_BASE_URL', 'http://localhost:3001');
  }

  // UCP Protocol Methods
  async getUcpSkills(category?: string) {
    const query = this.skillRepository.createQueryBuilder('skill')
      .where('skill.status = :status', { status: 'active' })
      .andWhere('skill.ucpEnabled = :enabled', { enabled: true });
    
    if (category) {
      query.andWhere('skill.category = :category', { category });
    }
    
    const skills = await query.getMany();
    
    return {
      protocol: 'UCP',
      version: '1.0',
      skills: skills.map(skill => this.formatSkillForUcp(skill)),
    };
  }

  async getUcpSkillDetail(skillId: string) {
    const skill = await this.skillRepository.findOne({
      where: { id: skillId, status: 'active' as any, ucpEnabled: true },
    });
    
    if (!skill) {
      throw new Error('Skill not found or not available via UCP');
    }
    
    return this.formatSkillForUcp(skill);
  }

  async invokeUcpSkill(skillId: string, params: any) {
    const skill = await this.getUcpSkillDetail(skillId);
    // Here you would implement actual skill invocation logic
    return {
      success: true,
      skillId,
      result: { message: 'Skill invoked successfully', params },
    };
  }

  private formatSkillForUcp(skill: Skill) {
    const baseUrl = this.getBaseUrl();
    return {
      id: skill.id,
      name: skill.name,
      displayName: skill.displayName || skill.name,
      description: skill.description,
      category: skill.category,
      version: skill.version,
      pricing: skill.pricing,
      endpoints: {
        invoke: `${baseUrl}/api/ucp/skills/${skill.id}/invoke`,
        detail: `${baseUrl}/api/ucp/skills/${skill.id}`,
      },
      schema: {
        input: skill.inputSchema,
        output: skill.outputSchema,
      },
    };
  }

  // MCP Protocol Methods
  async getMcpSkills(category?: string) {
    const query = this.skillRepository.createQueryBuilder('skill')
      .where('skill.status = :status', { status: 'active' });
    
    if (category) {
      query.andWhere('skill.category = :category', { category });
    }
    
    const skills = await query.getMany();
    
    return {
      protocol: 'MCP',
      version: '1.0',
      tools: skills.map(skill => this.formatSkillForMcp(skill)),
    };
  }

  async getMcpSkillDetail(skillId: string) {
    const skill = await this.skillRepository.findOne({
      where: { id: skillId, status: 'active' as any },
    });
    
    if (!skill) {
      throw new Error('Skill not found');
    }
    
    return this.formatSkillForMcp(skill);
  }

  async invokeMcpSkill(skillId: string, params: any) {
    const skill = await this.getMcpSkillDetail(skillId);
    return {
      success: true,
      skillId,
      result: { message: 'Skill invoked via MCP', params },
    };
  }

  private formatSkillForMcp(skill: Skill) {
    return {
      name: skill.name,
      description: skill.description,
      inputSchema: skill.inputSchema,
    };
  }

  // ACP Protocol Methods
  async getAcpSkills(category?: string) {
    const query = this.skillRepository.createQueryBuilder('skill')
      .where('skill.status = :status', { status: 'active' });
    
    if (category) {
      query.andWhere('skill.category = :category', { category });
    }
    
    const skills = await query.getMany();
    
    return {
      protocol: 'ACP',
      version: '1.0',
      actions: skills.map(skill => this.formatSkillForAcp(skill)),
    };
  }

  async getAcpSkillDetail(skillId: string) {
    const skill = await this.skillRepository.findOne({
      where: { id: skillId, status: 'active' as any },
    });
    
    if (!skill) {
      throw new Error('Skill not found');
    }
    
    return this.formatSkillForAcp(skill);
  }

  async invokeAcpSkill(skillId: string, params: any) {
    const skill = await this.getAcpSkillDetail(skillId);
    return {
      success: true,
      skillId,
      result: { message: 'Skill invoked via ACP', params },
    };
  }

  private formatSkillForAcp(skill: Skill) {
    const baseUrl = this.getBaseUrl();
    return {
      name: skill.name,
      description: skill.description,
      operation_id: skill.id,
      url: `${baseUrl}/api/acp/skills/${skill.id}/invoke`,
      parameters: skill.inputSchema,
    };
  }

  // X402 Protocol Methods
  async getX402Skills(category?: string) {
    const query = this.skillRepository.createQueryBuilder('skill')
      .where('skill.status = :status', { status: 'active' })
      .andWhere('skill.x402Enabled = :enabled', { enabled: true });
    
    if (category) {
      query.andWhere('skill.category = :category', { category });
    }
    
    const skills = await query.getMany();
    
    return {
      protocol: 'X402',
      version: '1.0',
      services: skills.map(skill => this.formatSkillForX402(skill)),
    };
  }

  async getX402SkillDetail(skillId: string) {
    const skill = await this.skillRepository.findOne({
      where: { id: skillId, status: 'active' as any, x402Enabled: true },
    });
    
    if (!skill) {
      throw new Error('Skill not found or not available via X402');
    }
    
    return this.formatSkillForX402(skill);
  }

  async invokeX402Skill(skillId: string, params: any) {
    const skill = await this.getX402SkillDetail(skillId);
    return {
      success: true,
      skillId,
      result: { message: 'Skill invoked via X402', params },
      payment: {
        required: true,
        amount: skill.pricing?.pricePerCall || 0,
        currency: skill.pricing?.currency || 'USDC',
      },
    };
  }

  private formatSkillForX402(skill: Skill) {
    const baseUrl = this.getBaseUrl();
    return {
      id: skill.id,
      name: skill.name,
      description: skill.description,
      pricing: skill.pricing,
      endpoints: {
        service: `${baseUrl}/api/x402/skills/${skill.id}/invoke`,
        payment: skill.x402ServiceEndpoint || `${baseUrl}/.well-known/x402`,
      },
    };
  }

  // Protocol Discovery
  async getProtocolDiscovery() {
    const baseUrl = this.getBaseUrl();
    const activeSkillsCount = await this.skillRepository.count({
      where: { status: 'active' as any },
    });

    return {
      platform: 'Agentrix',
      version: '2.0',
      protocols: [
        {
          name: 'UCP',
          version: '1.0',
          description: 'Unified Commerce Protocol for Gemini',
          endpoint: `${baseUrl}/api/ucp/skills`,
          supported: true,
        },
        {
          name: 'MCP',
          version: '1.0',
          description: 'Model Context Protocol for Claude',
          endpoint: `${baseUrl}/api/mcp/skills`,
          supported: true,
        },
        {
          name: 'ACP',
          version: '1.0',
          description: 'Action Protocol for ChatGPT',
          endpoint: `${baseUrl}/api/acp/skills`,
          supported: true,
        },
        {
          name: 'X402',
          version: '1.0',
          description: 'Payment Protocol for Agent-to-Agent transactions',
          endpoint: `${baseUrl}/api/x402/skills`,
          supported: true,
        },
      ],
      stats: {
        totalSkills: activeSkillsCount,
      },
    };
  }
}
