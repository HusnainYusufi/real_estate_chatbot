import { Body, Controller, Get, NotFoundException, Param, Post, Res } from '@nestjs/common';
import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import type { Response } from 'express';
import { BotsService } from '../bots/bots.service';
import { ChatService } from './chat.service';

class PublicChatDto {
  /** The bot's PUBLIC id (safe to embed in websites). */
  @IsUUID() botId: string;
  @IsOptional() @IsUUID() conversationId?: string;
  @IsString() @MinLength(1) @MaxLength(8000) message: string;
}

/** Unauthenticated endpoints consumed by the embeddable widget. */
@Controller('v1/public')
export class ChatController {
  constructor(
    private readonly chat: ChatService,
    private readonly bots: BotsService,
  ) {}

  @Get('bots/:publicId')
  async bootstrap(@Param('publicId') publicId: string) {
    const bot = await this.bots.getByPublicId(publicId);
    if (!bot) throw new NotFoundException('Bot not found or inactive');
    return {
      id: bot.publicId,
      name: bot.name,
      tagline: bot.tagline ?? '',
      greeting: bot.greeting ?? `Hi, I'm ${bot.name}. How can I help?`,
      suggestedQuestions: bot.suggestedQuestions ?? [],
    };
  }

  @Post('chat')
  async publicChat(@Body() dto: PublicChatDto, @Res() res: Response) {
    await this.chat.chat(dto.botId, dto.conversationId ?? null, dto.message.trim(), res);
  }
}
