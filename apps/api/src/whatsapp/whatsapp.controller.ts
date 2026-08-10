import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser, JwtAuthGuard, type AuthUser } from '../common/jwt-auth.guard';
import { WhatsappService } from './whatsapp.service';

/** Org-scoped WhatsApp channel management (also reused by the admin panel). */
@Controller('v1/bots/:botId/whatsapp')
@UseGuards(JwtAuthGuard)
export class WhatsappController {
  constructor(private readonly whatsapp: WhatsappService) {}

  @Post()
  connect(@CurrentUser() user: AuthUser, @Param('botId', ParseUUIDPipe) botId: string) {
    return this.whatsapp.connect(user.orgId, botId);
  }

  @Get()
  status(@CurrentUser() user: AuthUser, @Param('botId', ParseUUIDPipe) botId: string) {
    return this.whatsapp.status(user.orgId, botId);
  }

  @Delete()
  @HttpCode(204)
  async disconnect(@CurrentUser() user: AuthUser, @Param('botId', ParseUUIDPipe) botId: string) {
    await this.whatsapp.disconnect(user.orgId, botId);
  }
}
