import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BotsModule } from '../bots/bots.module';
import { Conversation, Message } from '../entities/conversation.entity';
import { ConversationsController } from './conversations.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Conversation, Message]), BotsModule],
  controllers: [ConversationsController],
})
export class ConversationsModule {}
