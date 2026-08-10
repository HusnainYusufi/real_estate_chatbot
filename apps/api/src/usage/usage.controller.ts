import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CurrentUser, JwtAuthGuard, type AuthUser } from '../common/jwt-auth.guard';
import { Message } from '../entities/conversation.entity';
import { Organization } from '../entities/organization.entity';

@Controller('v1/usage')
@UseGuards(JwtAuthGuard)
export class UsageController {
  constructor(
    @InjectRepository(Message) private readonly messages: Repository<Message>,
    @InjectRepository(Organization) private readonly orgs: Repository<Organization>,
  ) {}

  /** Per-bot usage for a calendar month (default: current month). */
  @Get()
  async usage(@CurrentUser() user: AuthUser, @Query('month') month?: string) {
    if (month && !/^\d{4}-\d{2}$/.test(month)) {
      throw new BadRequestException('month must be YYYY-MM');
    }
    const start = month ? `${month}-01` : null;

    const rows = await this.messages.query(
      `
      SELECT b.id AS bot_id, b.name,
             COUNT(m.id) FILTER (WHERE m.role = 'assistant')::int AS assistant_messages,
             COUNT(DISTINCT c.id) FILTER (WHERE m.id IS NOT NULL)::int AS conversations,
             COALESCE(SUM(m.input_tokens), 0)::bigint AS input_tokens,
             COALESCE(SUM(m.output_tokens), 0)::bigint AS output_tokens,
             COALESCE(SUM(m.cache_read_tokens), 0)::bigint AS cache_read_tokens,
             COALESCE(SUM(m.cost_usd), 0)::float AS cost_usd
      FROM bots b
      LEFT JOIN conversations c ON c.bot_id = b.id
      LEFT JOIN messages m ON m.conversation_id = c.id
        AND m.created_at >= COALESCE($2::timestamptz, date_trunc('month', now()))
        AND m.created_at < COALESCE($2::timestamptz, date_trunc('month', now())) + interval '1 month'
      WHERE b.org_id = $1
      GROUP BY b.id, b.name
      ORDER BY b.name
      `,
      [user.orgId, start],
    );

    const org = await this.orgs.findOneByOrFail({ id: user.orgId });
    const totalAssistantMessages = rows.reduce(
      (sum: number, r: { assistant_messages: number }) => sum + r.assistant_messages,
      0,
    );
    return {
      month: month ?? new Date().toISOString().slice(0, 7),
      plan: org.plan,
      monthlyMessageLimit: org.monthlyMessageLimit,
      assistantMessagesUsed: totalAssistantMessages,
      bots: rows,
    };
  }
}
