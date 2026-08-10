import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as crypto from 'node:crypto';
import { Repository } from 'typeorm';
import { AuthService } from '../auth/auth.service';
import { Conversation, Message } from '../entities/conversation.entity';
import { Organization } from '../entities/organization.entity';
import { User } from '../entities/user.entity';

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(Organization) private readonly orgs: Repository<Organization>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Conversation) private readonly conversations: Repository<Conversation>,
    @InjectRepository(Message) private readonly messages: Repository<Message>,
    private readonly auth: AuthService,
  ) {}

  /** Onboard a client: org + owner login. Returns the password ONCE. */
  async createClient(input: {
    organizationName: string;
    contactName: string;
    email: string;
    password?: string;
  }) {
    const password = input.password ?? crypto.randomBytes(9).toString('base64url');
    const result = await this.auth.register({
      organizationName: input.organizationName,
      name: input.contactName,
      email: input.email,
      password,
    });
    return {
      organization: result.organization,
      user: result.user,
      /** Show once in the admin panel; never retrievable again. */
      initialPassword: password,
    };
  }

  /**
   * CRM client list: server-side search + status filter + pagination, with
   * headline numbers and this month's actual AI cost per client.
   * Built to stay fast with thousands of orgs.
   */
  async listClients(params: { q?: string; status?: string; page?: number; pageSize?: number }) {
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.min(Math.max(1, params.pageSize ?? 25), 100);

    const filters = [
      `NOT EXISTS (SELECT 1 FROM users u WHERE u.org_id = o.id AND u.platform_admin = true)`,
    ];
    const values: unknown[] = [];
    if (params.q?.trim()) {
      values.push(`%${params.q.trim()}%`);
      filters.push(
        `(o.name ILIKE $${values.length} OR EXISTS (
           SELECT 1 FROM users u2 WHERE u2.org_id = o.id AND u2.email ILIKE $${values.length}
         ))`,
      );
    }
    if (params.status?.trim()) {
      values.push(params.status.trim());
      filters.push(`o.status = $${values.length}`);
    }
    const where = filters.join(' AND ');

    const [{ count: total }]: { count: number }[] = await this.orgs.query(
      `SELECT COUNT(*)::int AS count FROM organizations o WHERE ${where}`,
      values,
    );

    const items = await this.orgs.query(
      `
      SELECT o.id, o.name, o.plan, o.status, o.notes,
             o.monthly_message_limit AS "monthlyMessageLimit",
             o.created_at AS "createdAt",
             (SELECT COUNT(*)::int FROM bots b WHERE b.org_id = o.id) AS "botCount",
             (SELECT COUNT(*)::int FROM users u WHERE u.org_id = o.id) AS "userCount",
             (SELECT COUNT(*)::int
                FROM messages m JOIN conversations c ON c.id = m.conversation_id
               WHERE c.org_id = o.id AND m.role = 'assistant'
                 AND m.created_at >= date_trunc('month', now())) AS "messagesThisMonth",
             (SELECT COALESCE(SUM(m.cost_usd), 0)::float
                FROM messages m JOIN conversations c ON c.id = m.conversation_id
               WHERE c.org_id = o.id
                 AND m.created_at >= date_trunc('month', now())) AS "costThisMonth"
      FROM organizations o
      WHERE ${where}
      ORDER BY o.created_at DESC
      LIMIT $${values.length + 1} OFFSET $${values.length + 2}
      `,
      [...values, pageSize, (page - 1) * pageSize],
    );

    return { items, total, page, pageSize };
  }

  async getClient(orgId: string) {
    const org = await this.orgs.findOneBy({ id: orgId });
    if (!org) throw new NotFoundException('Client not found');
    const users = await this.users.find({
      where: { orgId },
      select: ['id', 'email', 'name', 'role', 'createdAt'],
    });
    const usage = await this.orgUsage(orgId);
    return { organization: org, users, usage };
  }

  async updateClient(
    orgId: string,
    patch: {
      name?: string;
      plan?: string;
      status?: string;
      notes?: string;
      monthlyMessageLimit?: number;
    },
  ) {
    const org = await this.orgs.findOneBy({ id: orgId });
    if (!org) throw new NotFoundException('Client not found');
    if (patch.name !== undefined) org.name = patch.name;
    if (patch.plan !== undefined) org.plan = patch.plan;
    if (patch.status !== undefined) org.status = patch.status;
    if (patch.notes !== undefined) org.notes = patch.notes;
    if (patch.monthlyMessageLimit !== undefined) {
      org.monthlyMessageLimit = patch.monthlyMessageLimit;
    }
    return this.orgs.save(org);
  }

  listConversations(orgId: string, botId: string, limit = 50) {
    return this.conversations.find({
      where: { orgId, botId },
      order: { updatedAt: 'DESC' },
      take: Math.min(limit, 200),
    });
  }

  async transcript(orgId: string, conversationId: string) {
    const conversation = await this.conversations.findOneBy({ id: conversationId, orgId });
    if (!conversation) throw new NotFoundException('Conversation not found');
    const rows = await this.messages.find({
      where: { conversationId },
      order: { createdAt: 'ASC' },
    });
    return rows
      .filter((m) => m.displayText)
      .map((m) => ({
        id: m.id,
        role: m.role,
        text: m.displayText,
        inputTokens: m.inputTokens,
        outputTokens: m.outputTokens,
        createdAt: m.createdAt,
      }));
  }

  private async orgUsage(orgId: string) {
    return this.messages.query(
      `
      SELECT b.id AS "botId", b.name,
             COUNT(m.id) FILTER (WHERE m.role = 'assistant')::int AS "assistantMessages",
             COUNT(DISTINCT c.id) FILTER (WHERE m.id IS NOT NULL)::int AS conversations,
             COALESCE(SUM(m.input_tokens), 0)::bigint AS "inputTokens",
             COALESCE(SUM(m.output_tokens), 0)::bigint AS "outputTokens",
             COALESCE(SUM(m.cost_usd), 0)::float AS "costUsd"
      FROM bots b
      LEFT JOIN conversations c ON c.bot_id = b.id
      LEFT JOIN messages m ON m.conversation_id = c.id
        AND m.created_at >= date_trunc('month', now())
      WHERE b.org_id = $1
      GROUP BY b.id, b.name
      ORDER BY b.name
      `,
      [orgId],
    );
  }
}
