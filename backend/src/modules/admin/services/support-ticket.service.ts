import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like, Between } from 'typeorm';
import {
  SupportTicket,
  SupportTicketReply,
  TicketStatus,
  TicketType,
  TicketPriority,
} from '../../../entities/support-ticket.entity';
import {
  CreateTicketDto,
  UpdateTicketDto,
  ReplyTicketDto,
  QueryTicketsDto,
} from '../dto/support-ticket.dto';

@Injectable()
export class SupportTicketService {
  constructor(
    @InjectRepository(SupportTicket)
    private ticketRepository: Repository<SupportTicket>,
    @InjectRepository(SupportTicketReply)
    private replyRepository: Repository<SupportTicketReply>,
  ) {}

  async createTicket(dto: CreateTicketDto) {
    // 生成工单号
    const ticketNumber = `T${Date.now()}${Math.random().toString(36).substr(2, 5).toUpperCase()}`;

    const ticket = this.ticketRepository.create({
      ticketNumber,
      userId: dto.userId,
      type: dto.type,
      subject: dto.subject,
      description: dto.description,
      priority: dto.priority || TicketPriority.MEDIUM,
      status: TicketStatus.PENDING,
      attachments: dto.attachments || [],
    });

    return await this.ticketRepository.save(ticket);
  }

  async getTickets(query: QueryTicketsDto) {
    const page = parseInt(query.page || '1');
    const limit = parseInt(query.limit || '20');
    const skip = (page - 1) * limit;

    const where: any = {};

    if (query.userId) {
      where.userId = query.userId;
    }

    if (query.status) {
      where.status = query.status;
    }

    if (query.type) {
      where.type = query.type;
    }

    if (query.priority) {
      where.priority = query.priority;
    }

    if (query.assignedToId) {
      where.assignedToId = query.assignedToId;
    }

    const [tickets, total] = await this.ticketRepository.findAndCount({
      where,
      skip,
      take: limit,
      order: { createdAt: 'DESC' },
      relations: ['user', 'assignedTo'],
    });

    return {
      data: tickets,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getTicketById(id: string) {
    const ticket = await this.ticketRepository.findOne({
      where: { id },
      relations: ['user', 'assignedTo'],
    });

    if (!ticket) {
      throw new NotFoundException('工单不存在');
    }

    // 获取回复
    const replies = await this.replyRepository.find({
      where: { ticketId: id },
      relations: ['user', 'adminUser'],
      order: { createdAt: 'ASC' },
    });

    return {
      ...ticket,
      replies,
    };
  }

  async updateTicket(id: string, dto: UpdateTicketDto) {
    const ticket = await this.ticketRepository.findOne({ where: { id } });
    if (!ticket) {
      throw new NotFoundException('工单不存在');
    }

    if (dto.status) {
      ticket.status = dto.status;
      if (dto.status === TicketStatus.RESOLVED) {
        ticket.resolvedAt = new Date();
      } else if (dto.status === TicketStatus.CLOSED) {
        ticket.closedAt = new Date();
      }
    }

    if (dto.priority) {
      ticket.priority = dto.priority;
    }

    if (dto.assignedToId) {
      ticket.assignedToId = dto.assignedToId;
    }

    return await this.ticketRepository.save(ticket);
  }

  async replyTicket(id: string, dto: ReplyTicketDto, adminUserId?: string, userId?: string) {
    const ticket = await this.ticketRepository.findOne({ where: { id } });
    if (!ticket) {
      throw new NotFoundException('工单不存在');
    }

    const reply = this.replyRepository.create({
      ticketId: id,
      adminUserId,
      userId,
      content: dto.content,
      attachments: dto.attachments || [],
      isInternal: dto.isInternal === 'true',
    });

    await this.replyRepository.save(reply);

    // 如果用户回复，更新工单状态为处理中
    if (userId && ticket.status === TicketStatus.PENDING) {
      ticket.status = TicketStatus.IN_PROGRESS;
      await this.ticketRepository.save(ticket);
    }

    return reply;
  }

  async getTicketStatistics() {
    const [
      total,
      pending,
      inProgress,
      resolved,
      closed,
      byType,
      byPriority,
    ] = await Promise.all([
      this.ticketRepository.count(),
      this.ticketRepository.count({ where: { status: TicketStatus.PENDING } }),
      this.ticketRepository.count({ where: { status: TicketStatus.IN_PROGRESS } }),
      this.ticketRepository.count({ where: { status: TicketStatus.RESOLVED } }),
      this.ticketRepository.count({ where: { status: TicketStatus.CLOSED } }),
      this.ticketRepository
        .createQueryBuilder('ticket')
        .select('ticket.type', 'type')
        .addSelect('COUNT(*)', 'count')
        .groupBy('ticket.type')
        .getRawMany(),
      this.ticketRepository
        .createQueryBuilder('ticket')
        .select('ticket.priority', 'priority')
        .addSelect('COUNT(*)', 'count')
        .groupBy('ticket.priority')
        .getRawMany(),
    ]);

    return {
      total,
      pending,
      inProgress,
      resolved,
      closed,
      byType: byType.reduce((acc, item) => {
        acc[item.type] = parseInt(item.count);
        return acc;
      }, {} as Record<string, number>),
      byPriority: byPriority.reduce((acc, item) => {
        acc[item.priority] = parseInt(item.count);
        return acc;
      }, {} as Record<string, number>),
    };
  }
}

