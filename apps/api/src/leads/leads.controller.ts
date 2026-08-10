import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { BotsService } from '../bots/bots.service';
import { CurrentUser, JwtAuthGuard, type AuthUser } from '../common/jwt-auth.guard';
import { LeadsService } from './leads.service';

@Controller('v1/bots/:botId/leads')
@UseGuards(JwtAuthGuard)
export class LeadsController {
  constructor(
    private readonly leads: LeadsService,
    private readonly bots: BotsService,
  ) {}

  @Get()
  async list(@CurrentUser() user: AuthUser, @Param('botId', ParseUUIDPipe) botId: string) {
    await this.bots.getOwned(user.orgId, botId);
    return this.leads.listForBot(botId);
  }
}
