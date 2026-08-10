import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { IsIn, IsOptional, IsString } from 'class-validator';
import { AdminGuard } from '../admin/admin.guard';
import { InternalGuard } from '../common/internal.guard';
import { VoiceService } from './voice.service';

class AttachNumberDto {
  @IsString() number: string;
}
class OutboundDto {
  @IsString() toNumber: string;
}
class ResolveQuery {
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() botId?: string;
}
class CreateCallDto {
  @IsString() botId: string;
  @IsIn(['inbound', 'outbound']) direction: string;
  @IsString() peerNumber: string;
  @IsOptional() @IsString() room?: string;
}
class FinishCallDto {
  @IsOptional() transcript?: unknown;
  @IsOptional() @IsString() status?: string;
  @IsOptional() durationSeconds?: number;
}

/** Operator-facing voice management (admin panel). */
@Controller('v1/admin/clients/:orgId/bots/:botId/voice')
@UseGuards(AdminGuard)
export class VoiceAdminController {
  constructor(private readonly voice: VoiceService) {}

  @Get('numbers')
  listNumbers(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('botId', ParseUUIDPipe) botId: string,
  ) {
    return this.voice.listNumbers(orgId, botId);
  }

  @Post('numbers')
  attachNumber(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('botId', ParseUUIDPipe) botId: string,
    @Body() dto: AttachNumberDto,
  ) {
    return this.voice.attachNumber(orgId, botId, dto.number);
  }

  @Delete('numbers/:numberId')
  @HttpCode(204)
  async detachNumber(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('numberId', ParseUUIDPipe) numberId: string,
  ) {
    await this.voice.detachNumber(orgId, numberId);
  }

  @Post('call')
  placeCall(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('botId', ParseUUIDPipe) botId: string,
    @Body() dto: OutboundDto,
  ) {
    return this.voice.placeOutboundCall(orgId, botId, dto.toNumber);
  }

  @Get('calls')
  listCalls(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('botId', ParseUUIDPipe) botId: string,
  ) {
    return this.voice.listCalls(orgId, botId);
  }
}

/** Service-to-service endpoints for the voice agent. */
@Controller('internal/voice')
@UseGuards(InternalGuard)
export class VoiceInternalController {
  constructor(private readonly voice: VoiceService) {}

  @Get('resolve')
  resolve(@Query() q: ResolveQuery) {
    return this.voice.resolveForCall(q);
  }

  @Post('calls')
  createCall(@Body() dto: CreateCallDto) {
    return this.voice.createCallRecord(dto);
  }

  @Post('calls/:callId/finish')
  @HttpCode(200)
  async finishCall(@Param('callId', ParseUUIDPipe) callId: string, @Body() dto: FinishCallDto) {
    await this.voice.finishCallRecord(callId, dto);
    return { ok: true };
  }
}
