import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BotsModule } from '../bots/bots.module';
import { ChatModule } from '../chat/chat.module';
import { WhatsappChannel } from '../entities/whatsapp-channel.entity';
import { OpenWAClient } from './openwa.client';
import { WhatsappController } from './whatsapp.controller';
import { WhatsappWebhookController } from './whatsapp-webhook.controller';
import { WhatsappService } from './whatsapp.service';

@Module({
  imports: [TypeOrmModule.forFeature([WhatsappChannel]), BotsModule, ChatModule],
  controllers: [WhatsappController, WhatsappWebhookController],
  providers: [WhatsappService, OpenWAClient],
  exports: [WhatsappService],
})
export class WhatsappModule {}
