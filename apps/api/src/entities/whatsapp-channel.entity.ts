import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Links a bot to a WhatsApp number via an OpenWA session.
 * One WhatsApp number (session) per bot.
 */
@Entity('whatsapp_channels')
export class WhatsappChannel {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column('uuid')
  botId: string;

  @Index()
  @Column('uuid')
  orgId: string;

  /** OpenWA session id (uuid returned by POST /api/sessions). */
  @Index()
  @Column('varchar')
  sessionId: string;

  @Column('varchar')
  sessionName: string;

  /** Last known status: created|initializing|qr_ready|authenticating|ready|disconnected|action_required|failed */
  @Column('varchar', { default: 'created' })
  status: string;

  /** Connected phone number, once paired. */
  @Column('varchar', { nullable: true })
  phone: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
