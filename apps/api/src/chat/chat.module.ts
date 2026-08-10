import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BotsModule } from '../bots/bots.module';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { ProvidersModule } from '../providers/providers.module';
import { Conversation, Message } from '../entities/conversation.entity';
import { Organization } from '../entities/organization.entity';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Conversation, Message, Organization]),
    BotsModule,
    KnowledgeModule,
    ProvidersModule,
  ],
  controllers: [ChatController],
  providers: [ChatService],
  exports: [ChatService],
})
export class ChatModule {}
