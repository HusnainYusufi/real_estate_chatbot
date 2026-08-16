import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';
import { AuthModule } from './auth/auth.module';
import { BotsModule } from './bots/bots.module';
import { ChatModule } from './chat/chat.module';
import { config } from './config';
import { ConversationsModule } from './conversations/conversations.module';
import { InternalModule } from './internal/internal.module';
import { AdminModule } from './admin/admin.module';
import { CatalogModule } from './catalog/catalog.module';
import { HealthController } from './health.controller';
import { KnowledgeModule } from './knowledge/knowledge.module';
import { LeadsModule } from './leads/leads.module';
import { PackagesModule } from './packages/packages.module';
import { TemplatesModule } from './templates/templates.module';
import { UsageModule } from './usage/usage.module';
import { VoiceModule } from './voice/voice.module';
import { WhatsappModule } from './whatsapp/whatsapp.module';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: config.databaseUrl,
      autoLoadEntities: true,
      synchronize: config.dbSync,
      namingStrategy: new SnakeNamingStrategy(),
    }),
    AuthModule,
    CatalogModule,
    BotsModule,
    KnowledgeModule,
    ChatModule,
    ConversationsModule,
    LeadsModule,
    UsageModule,
    InternalModule,
    WhatsappModule,
    TemplatesModule,
    PackagesModule,
    VoiceModule,
    AdminModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
