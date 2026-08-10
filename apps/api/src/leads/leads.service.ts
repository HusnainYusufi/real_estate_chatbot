import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Lead } from '../entities/lead.entity';

@Injectable()
export class LeadsService {
  constructor(@InjectRepository(Lead) private readonly leads: Repository<Lead>) {}

  create(input: {
    botId: string;
    conversationId?: string | null;
    name: string;
    contact: string;
    notes?: string;
  }): Promise<Lead> {
    return this.leads.save(
      this.leads.create({
        botId: input.botId,
        conversationId: input.conversationId ?? null,
        name: input.name,
        contact: input.contact,
        notes: input.notes ?? '',
      }),
    );
  }

  listForBot(botId: string): Promise<Lead[]> {
    return this.leads.find({ where: { botId }, order: { createdAt: 'DESC' } });
  }
}
