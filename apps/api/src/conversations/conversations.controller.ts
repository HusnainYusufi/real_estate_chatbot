import {
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BotsService } from '../bots/bots.service';
import { CurrentUser, JwtAuthGuard, type AuthUser } from '../common/jwt-auth.guard';
import { Conversation, Message } from '../entities/conversation.entity';

@Controller('v1')
@UseGuards(JwtAuthGuard)
export class ConversationsController {
  constructor(
    @InjectRepository(Conversation) private readonly conversations: Repository<Conversation>,
    @InjectRepository(Message) private readonly messages: Repository<Message>,
    private readonly bots: BotsService,
  ) {}

  @Get('bots/:botId/conversations')
  async list(
    @CurrentUser() user: AuthUser,
    @Param('botId', ParseUUIDPipe) botId: string,
    @Query('limit') limit = '50',
  ) {
    await this.bots.getOwned(user.orgId, botId);
    return this.conversations.find({
      where: { botId },
      order: { updatedAt: 'DESC' },
      take: Math.min(Number(limit) || 50, 200),
    });
  }

  @Get('conversations/:id/messages')
  async transcript(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    const conversation = await this.conversations.findOneBy({ id, orgId: user.orgId });
    if (!conversation) throw new NotFoundException('Conversation not found');
    const rows = await this.messages.find({
      where: { conversationId: id },
      order: { createdAt: 'ASC' },
    });
    return rows
      .filter((m) => m.displayText)
      .map((m) => ({
        id: m.id,
        role: m.role,
        text: m.displayText,
        inputTokens: m.inputTokens,
        outputTokens: m.outputTokens,
        createdAt: m.createdAt,
      }));
  }
}
