import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { InternalGuard } from '../common/internal.guard';
import { KnowledgeService } from '../knowledge/knowledge.service';
import { LeadsService } from '../leads/leads.service';

class CreateLeadDto {
  @IsUUID() botId: string;
  @IsOptional() @IsUUID() conversationId?: string;
  @IsString() @MinLength(1) @MaxLength(200) name: string;
  @IsString() @MinLength(3) @MaxLength(200) contact: string;
  @IsOptional() @IsString() @MaxLength(4000) notes?: string;
}

/**
 * Service-to-service endpoints for the AI engine (tool execution).
 * The engine stays stateless: all data access goes through here.
 */
@Controller('internal')
@UseGuards(InternalGuard)
export class InternalController {
  constructor(
    private readonly knowledge: KnowledgeService,
    private readonly leads: LeadsService,
  ) {}

  @Get('knowledge/search')
  async search(
    @Query('botId') botId: string,
    @Query('q') q: string,
    @Query('limit') limit?: string,
  ) {
    const hits = await this.knowledge.search(
      botId,
      q ?? '',
      Math.min(Number(limit) || 4, 10),
    );
    return { hits };
  }

  @Post('leads')
  async createLead(@Body() dto: CreateLeadDto) {
    const lead = await this.leads.create(dto);
    return { id: lead.id, createdAt: lead.createdAt };
  }
}
