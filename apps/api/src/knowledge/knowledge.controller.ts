import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { BotsService } from '../bots/bots.service';
import { CurrentUser, JwtAuthGuard, type AuthUser } from '../common/jwt-auth.guard';
import { KnowledgeService } from './knowledge.service';

class AddDocumentDto {
  @IsString() @MinLength(1) @MaxLength(200) title: string;
  /** Markdown or plain text. ~1MB cap. */
  @IsString() @MinLength(1) @MaxLength(1_000_000) content: string;
}

@Controller('v1/bots/:botId/documents')
@UseGuards(JwtAuthGuard)
export class KnowledgeController {
  constructor(
    private readonly knowledge: KnowledgeService,
    private readonly bots: BotsService,
  ) {}

  @Get()
  async list(@CurrentUser() user: AuthUser, @Param('botId', ParseUUIDPipe) botId: string) {
    await this.bots.getOwned(user.orgId, botId);
    return this.knowledge.listDocuments(botId);
  }

  @Post()
  async add(
    @CurrentUser() user: AuthUser,
    @Param('botId', ParseUUIDPipe) botId: string,
    @Body() dto: AddDocumentDto,
  ) {
    await this.bots.getOwned(user.orgId, botId);
    const doc = await this.knowledge.addDocument(botId, dto.title, dto.content);
    return { id: doc.id, title: doc.title, chunkCount: doc.chunkCount, createdAt: doc.createdAt };
  }

  @Delete(':documentId')
  @HttpCode(204)
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('botId', ParseUUIDPipe) botId: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
  ) {
    await this.bots.getOwned(user.orgId, botId);
    await this.knowledge.removeDocument(botId, documentId);
  }
}
