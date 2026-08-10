import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser, JwtAuthGuard, type AuthUser } from '../common/jwt-auth.guard';
import { UpsertBotDto } from './bots.dto';
import { BotsService } from './bots.service';

@Controller('v1/bots')
@UseGuards(JwtAuthGuard)
export class BotsController {
  constructor(private readonly bots: BotsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.bots.list(user.orgId);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: UpsertBotDto) {
    return this.bots.create(user.orgId, dto);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.bots.getOwned(user.orgId, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: Partial<UpsertBotDto>,
  ) {
    return this.bots.update(user.orgId, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.bots.remove(user.orgId, id);
  }
}
