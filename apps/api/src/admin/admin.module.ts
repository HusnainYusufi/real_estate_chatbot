import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BotsModule } from '../bots/bots.module';
import { Conversation, Message } from '../entities/conversation.entity';
import { Organization } from '../entities/organization.entity';
import { User } from '../entities/user.entity';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { LeadsModule } from '../leads/leads.module';
import { PackagesModule } from '../packages/packages.module';
import { ProvidersModule } from '../providers/providers.module';
import { TemplatesModule } from '../templates/templates.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { AdminController } from './admin.controller';
import { AdminGuard } from './admin.guard';
import { AdminService } from './admin.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Organization, User, Conversation, Message]),
    BotsModule,
    KnowledgeModule,
    LeadsModule,
    WhatsappModule,
    TemplatesModule,
    ProvidersModule,
    PackagesModule,
  ],
  controllers: [AdminController],
  providers: [AdminService, AdminGuard],
})
export class AdminModule {}
