import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminGuard } from '../admin/admin.guard';
import { BotsModule } from '../bots/bots.module';
import { Call } from '../entities/call.entity';
import { PhoneNumber } from '../entities/phone-number.entity';
import { User } from '../entities/user.entity';
import { ProvidersModule } from '../providers/providers.module';
import { VoiceAdminController, VoiceInternalController } from './voice.controller';
import { VoiceService } from './voice.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([PhoneNumber, Call, User]),
    BotsModule,
    ProvidersModule,
  ],
  controllers: [VoiceAdminController, VoiceInternalController],
  providers: [VoiceService, AdminGuard],
})
export class VoiceModule {}
