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
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { UpsertBotDto } from '../bots/bots.dto';
import { BotsService } from '../bots/bots.service';
import { CatalogService } from '../catalog/catalog.service';
import { KnowledgeService } from '../knowledge/knowledge.service';
import { LeadsService } from '../leads/leads.service';
import { ProvidersService } from '../providers/providers.service';
import { TemplatesService } from '../templates/templates.service';
import { WhatsappService } from '../whatsapp/whatsapp.service';
import { AdminGuard } from './admin.guard';
import { AdminService } from './admin.service';

class CreateClientDto {
  @IsString() @MinLength(1) @MaxLength(120) organizationName: string;
  @IsString() @MinLength(1) @MaxLength(120) contactName: string;
  @IsEmail() email: string;
  @IsOptional() @IsString() @MinLength(8) @MaxLength(128) password?: string;
}

class UpdateClientDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120) name?: string;
  @IsOptional() @IsString() @MaxLength(40) plan?: string;
  @IsOptional() @IsIn(['lead', 'trial', 'active', 'paused', 'churned']) status?: string;
  @IsOptional() @IsString() @MaxLength(10000) notes?: string;
  @IsOptional() @IsInt() @Min(0) monthlyMessageLimit?: number;
}

class SetProviderKeyDto {
  @IsIn(['anthropic', 'openai', 'gemini']) provider: string;
  @IsString() @MinLength(8) @MaxLength(500) apiKey: string;
  /** Omit for a platform-wide key; set to scope the key to one client. */
  @IsOptional() @IsUUID() orgId?: string;
}

class CreateBotFromTemplateDto {
  @IsString() @MinLength(1) @MaxLength(64) templateId: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120) name?: string;
}

class AddDocumentDto {
  @IsString() @MinLength(1) @MaxLength(200) title: string;
  @IsString() @MinLength(1) @MaxLength(1_000_000) content: string;
}

class AddUrlDto {
  @IsString() @MaxLength(2000) url: string;
  @IsOptional() @IsBoolean() crawl?: boolean;
  @IsOptional() @IsInt() @Min(1) @Max(30) maxPages?: number;
}

/**
 * Platform-operator API consumed by the Next.js admin panel.
 * Everything is org-explicit: the operator manages ALL client workspaces.
 */
@Controller('v1/admin')
@UseGuards(AdminGuard)
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly bots: BotsService,
    private readonly knowledge: KnowledgeService,
    private readonly leads: LeadsService,
    private readonly whatsapp: WhatsappService,
    private readonly templates: TemplatesService,
    private readonly catalog: CatalogService,
    private readonly providers: ProvidersService,
  ) {}

  // ── Models & providers (BYO keys) ────────────────────────────────────────

  /** Model catalog with pricing + which providers have keys attached. */
  @Get('models')
  async models() {
    return {
      pricesAsOf: this.catalog.pricesAsOf,
      models: this.catalog.list(),
      configuredProviders: await this.providers.configuredProviders(),
    };
  }

  @Get('providers')
  listProviderKeys() {
    return this.providers.list(null);
  }

  @Post('providers')
  setProviderKey(@Body() dto: SetProviderKeyDto) {
    return this.providers.setKey(dto.provider, dto.apiKey, dto.orgId ?? null);
  }

  @Delete('providers/:id')
  @HttpCode(204)
  async deleteProviderKey(@Param('id', ParseUUIDPipe) id: string) {
    await this.providers.remove(id);
  }

  // ── Templates ────────────────────────────────────────────────────────────

  @Get('templates')
  listTemplates() {
    return this.templates.list().map((t) => ({
      id: t.id,
      name: t.name,
      tagline: t.tagline ?? '',
      leadCaptureEnabled: t.leadCaptureEnabled ?? false,
      knowledgeFiles: t.knowledgeFiles ?? [],
    }));
  }

  // ── Clients (orgs) ───────────────────────────────────────────────────────

  @Get('clients')
  listClients(
    @Query('q') q?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.admin.listClients({
      q,
      status,
      page: Number(page) || 1,
      pageSize: Number(pageSize) || 25,
    });
  }

  @Post('clients')
  createClient(@Body() dto: CreateClientDto) {
    return this.admin.createClient(dto);
  }

  @Get('clients/:orgId')
  getClient(@Param('orgId', ParseUUIDPipe) orgId: string) {
    return this.admin.getClient(orgId);
  }

  @Patch('clients/:orgId')
  updateClient(@Param('orgId', ParseUUIDPipe) orgId: string, @Body() dto: UpdateClientDto) {
    return this.admin.updateClient(orgId, dto);
  }

  // ── Bots ─────────────────────────────────────────────────────────────────

  @Get('clients/:orgId/bots')
  listBots(@Param('orgId', ParseUUIDPipe) orgId: string) {
    return this.bots.list(orgId);
  }

  @Post('clients/:orgId/bots')
  createBot(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Body() dto: CreateBotFromTemplateDto,
  ) {
    return this.templates.instantiate(this.bots, this.knowledge, orgId, dto.templateId, {
      name: dto.name,
    });
  }

  @Patch('clients/:orgId/bots/:botId')
  updateBot(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('botId', ParseUUIDPipe) botId: string,
    @Body() dto: Partial<UpsertBotDto>,
  ) {
    return this.bots.update(orgId, botId, dto);
  }

  @Delete('clients/:orgId/bots/:botId')
  @HttpCode(204)
  async deleteBot(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('botId', ParseUUIDPipe) botId: string,
  ) {
    await this.bots.remove(orgId, botId);
  }

  // ── Knowledge ────────────────────────────────────────────────────────────

  @Get('clients/:orgId/bots/:botId/documents')
  async listDocuments(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('botId', ParseUUIDPipe) botId: string,
  ) {
    await this.bots.getOwned(orgId, botId);
    return this.knowledge.listDocuments(botId);
  }

  @Post('clients/:orgId/bots/:botId/documents')
  async addDocument(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('botId', ParseUUIDPipe) botId: string,
    @Body() dto: AddDocumentDto,
  ) {
    await this.bots.getOwned(orgId, botId);
    const doc = await this.knowledge.addDocument(botId, dto.title, dto.content);
    return { id: doc.id, title: doc.title, chunkCount: doc.chunkCount, createdAt: doc.createdAt };
  }

  @Post('clients/:orgId/bots/:botId/documents/url')
  async addDocumentFromUrl(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('botId', ParseUUIDPipe) botId: string,
    @Body() dto: AddUrlDto,
  ) {
    await this.bots.getOwned(orgId, botId);
    return this.knowledge.addFromUrl(botId, dto.url, { crawl: dto.crawl, maxPages: dto.maxPages });
  }

  @Delete('clients/:orgId/bots/:botId/documents/:documentId')
  @HttpCode(204)
  async deleteDocument(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('botId', ParseUUIDPipe) botId: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
  ) {
    await this.bots.getOwned(orgId, botId);
    await this.knowledge.removeDocument(botId, documentId);
  }

  // ── Leads & conversations ────────────────────────────────────────────────

  @Get('clients/:orgId/bots/:botId/leads')
  async listLeads(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('botId', ParseUUIDPipe) botId: string,
  ) {
    await this.bots.getOwned(orgId, botId);
    return this.leads.listForBot(botId);
  }

  @Get('clients/:orgId/bots/:botId/conversations')
  async listConversations(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('botId', ParseUUIDPipe) botId: string,
    @Query('limit') limit = '50',
  ) {
    await this.bots.getOwned(orgId, botId);
    return this.admin.listConversations(orgId, botId, Number(limit) || 50);
  }

  @Get('clients/:orgId/conversations/:conversationId/messages')
  transcript(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
  ) {
    return this.admin.transcript(orgId, conversationId);
  }

  // ── WhatsApp ─────────────────────────────────────────────────────────────

  @Post('clients/:orgId/bots/:botId/whatsapp')
  connectWhatsapp(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('botId', ParseUUIDPipe) botId: string,
  ) {
    return this.whatsapp.connect(orgId, botId);
  }

  @Get('clients/:orgId/bots/:botId/whatsapp')
  whatsappStatus(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('botId', ParseUUIDPipe) botId: string,
  ) {
    return this.whatsapp.status(orgId, botId);
  }

  @Delete('clients/:orgId/bots/:botId/whatsapp')
  @HttpCode(204)
  async disconnectWhatsapp(
    @Param('orgId', ParseUUIDPipe) orgId: string,
    @Param('botId', ParseUUIDPipe) botId: string,
  ) {
    await this.whatsapp.disconnect(orgId, botId);
  }
}
