import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Bot } from '../entities/bot.entity';
import { BotsController } from './bots.controller';
import { BotsService } from './bots.service';

@Module({
  imports: [TypeOrmModule.forFeature([Bot])],
  controllers: [BotsController],
  providers: [BotsService],
  exports: [BotsService],
})
export class BotsModule {}
