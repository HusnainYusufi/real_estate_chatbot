import { Module } from '@nestjs/common';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { LeadsModule } from '../leads/leads.module';
import { InternalController } from './internal.controller';

@Module({
  imports: [KnowledgeModule, LeadsModule],
  controllers: [InternalController],
})
export class InternalModule {}
