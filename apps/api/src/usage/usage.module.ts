import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Message } from '../entities/conversation.entity';
import { Organization } from '../entities/organization.entity';
import { UsageController } from './usage.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Message, Organization])],
  controllers: [UsageController],
})
export class UsageModule {}
