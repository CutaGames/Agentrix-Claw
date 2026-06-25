import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not } from 'typeorm';
import { DirectMessage, DMStatus, ConversationSummary } from '../../entities/direct-message.entity';

export interface SendDMDto {
  receiverId: string;
  content: string;
  senderName?: string;
  senderAvatar?: string;
}

function makeConversationKey(a: string, b: string): string {
  return [a, b].sort().join('_');
}

@Injectable()
export class MessagingService {
  constructor(
    @InjectRepository(DirectMessage)
    private readonly dmRepo: Repository<DirectMessage>,
  ) {}

  /** Send a DM from sender to receiver */
  async sendDM(senderId: string, dto: SendDMDto): Promise<DirectMessage> {
    const dm = this.dmRepo.create({
      senderId,
      senderName: dto.senderName,
      senderAvatar: dto.senderAvatar,
      receiverId: dto.receiverId,
      content: dto.content,
      conversationKey: makeConversationKey(senderId, dto.receiverId),
      status: DMStatus.SENT,
    });
    return this.dmRepo.save(dm);
  }

  /** Get messages in a conversation (paginated) */
  async getConversation(
    userId: string,
    partnerId: string,
    page = 1,
    limit = 50,
  ): Promise<{ messages: DirectMessage[]; total: number }> {
    const key = makeConversationKey(userId, partnerId);
    const [messages, total] = await this.dmRepo.findAndCount({
      where: { conversationKey: key },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { messages: messages.reverse(), total };
  }

  /** Get all conversations for a user (one per unique partner) */
  async getConversations(userId: string): Promise<ConversationSummary[]> {
    // Find all messages where user is involved, group by conversationKey
    const raw = await this.dmRepo
      .createQueryBuilder('dm')
      .where('dm.senderId = :userId OR dm.receiverId = :userId', { userId })
      .orderBy('dm.createdAt', 'DESC')
      .getMany();

    // Build conversation map: conversationKey → summary
    const map = new Map<string, ConversationSummary>();
    for (const msg of raw) {
      if (map.has(msg.conversationKey)) continue;
      const partnerId = msg.senderId === userId ? msg.receiverId : msg.senderId;
      const partnerName = msg.senderId === userId
        ? (msg as any).receiverName || partnerId.substring(0, 8)
        : msg.senderName || partnerId.substring(0, 8);
      const partnerAvatar = msg.senderId === userId
        ? (msg as any).receiverAvatar
        : msg.senderAvatar;

      // Count unread for this conversation
      const unreadCount = await this.dmRepo.count({
        where: {
          conversationKey: msg.conversationKey,
          receiverId: userId,
          status: DMStatus.SENT,
        },
      });

      map.set(msg.conversationKey, {
        partnerId,
        partnerName,
        partnerAvatar,
        lastMessage: msg.content,
        lastMessageAt: msg.createdAt,
        unreadCount,
      });
    }

    return Array.from(map.values());
  }

  /** Mark all messages in a conversation as read */
  async markAsRead(userId: string, partnerId: string): Promise<void> {
    const key = makeConversationKey(userId, partnerId);
    await this.dmRepo.update(
      { conversationKey: key, receiverId: userId, status: DMStatus.SENT },
      { status: DMStatus.READ },
    );
  }

  /** Get unread DM count for a user */
  async getUnreadCount(userId: string): Promise<number> {
    return this.dmRepo.count({
      where: { receiverId: userId, status: DMStatus.SENT },
    });
  }
}
