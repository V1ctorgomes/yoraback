import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  EmailCampaignStatus,
  EmailRecipientType,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateEmailCampaignDto,
  QueryEmailCampaignsDto,
  ScheduleEmailCampaignDto,
  UpdateEmailCampaignDto,
} from './dto/email-campaign.dto';
import { EmailService } from './email.service';

@Injectable()
export class EmailCampaignService {
  constructor(
    private prisma: PrismaService,
    private emailService: EmailService,
  ) {}

  async findAll(query: QueryEmailCampaignsDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.EmailCampaignWhereInput = {};

    if (query.status) where.status = query.status;

    const [total, rows] = await Promise.all([
      this.prisma.emailCampaign.count({ where }),
      this.prisma.emailCampaign.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { template: { select: { id: true, name: true } } },
      }),
    ]);

    return {
      data: rows.map((row) => this.mapCampaign(row)),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async findOne(id: string) {
    const row = await this.prisma.emailCampaign.findUnique({
      where: { id },
      include: { template: { select: { id: true, name: true } } },
    });

    if (!row) throw new NotFoundException('Campanha não encontrada.');
    return this.mapCampaign(row);
  }

  async create(dto: CreateEmailCampaignDto) {
    const recipients = await this.resolveRecipients(
      dto.recipientType ?? EmailRecipientType.ACTIVE_ONLY,
      dto.recipientEmails ?? [],
    );

    const row = await this.prisma.emailCampaign.create({
      data: {
        name: dto.name.trim(),
        subject: dto.subject.trim(),
        fromName: dto.fromName?.trim(),
        fromEmail: dto.fromEmail?.trim().toLowerCase(),
        replyTo: dto.replyTo?.trim().toLowerCase(),
        templateId: dto.templateId,
        html: dto.html,
        text: dto.text,
        recipientType: dto.recipientType ?? EmailRecipientType.ACTIVE_ONLY,
        recipientEmails: dto.recipientEmails ?? [],
        recipientCount: recipients.length,
        status: EmailCampaignStatus.DRAFT,
      },
      include: { template: { select: { id: true, name: true } } },
    });

    return this.mapCampaign(row);
  }

  async update(id: string, dto: UpdateEmailCampaignDto) {
    const current = await this.findOne(id);

    if (
      current.status !== EmailCampaignStatus.DRAFT &&
      current.status !== EmailCampaignStatus.SCHEDULED
    ) {
      throw new BadRequestException(
        'Apenas campanhas em rascunho ou agendadas podem ser editadas.',
      );
    }

    const recipientType = dto.recipientType ?? current.recipientType;
    const recipientEmails =
      dto.recipientEmails ?? current.recipientEmails ?? [];
    const recipients = await this.resolveRecipients(
      recipientType as EmailRecipientType,
      recipientEmails,
    );

    const row = await this.prisma.emailCampaign.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.subject !== undefined ? { subject: dto.subject.trim() } : {}),
        ...(dto.fromName !== undefined ? { fromName: dto.fromName?.trim() } : {}),
        ...(dto.fromEmail !== undefined
          ? { fromEmail: dto.fromEmail?.trim().toLowerCase() }
          : {}),
        ...(dto.replyTo !== undefined
          ? { replyTo: dto.replyTo?.trim().toLowerCase() }
          : {}),
        ...(dto.templateId !== undefined ? { templateId: dto.templateId } : {}),
        ...(dto.html !== undefined ? { html: dto.html } : {}),
        ...(dto.text !== undefined ? { text: dto.text } : {}),
        ...(dto.recipientType !== undefined
          ? { recipientType: dto.recipientType }
          : {}),
        ...(dto.recipientEmails !== undefined
          ? { recipientEmails: dto.recipientEmails }
          : {}),
        recipientCount: recipients.length,
      },
      include: { template: { select: { id: true, name: true } } },
    });

    return this.mapCampaign(row);
  }

  async duplicate(id: string) {
    const source = await this.prisma.emailCampaign.findUnique({ where: { id } });
    if (!source) throw new NotFoundException('Campanha não encontrada.');

    const row = await this.prisma.emailCampaign.create({
      data: {
        name: `${source.name} (cópia)`,
        subject: source.subject,
        fromName: source.fromName,
        fromEmail: source.fromEmail,
        replyTo: source.replyTo,
        templateId: source.templateId,
        html: source.html,
        text: source.text,
        recipientType: source.recipientType,
        recipientEmails: source.recipientEmails,
        recipientCount: source.recipientCount,
        status: EmailCampaignStatus.DRAFT,
      },
      include: { template: { select: { id: true, name: true } } },
    });

    return this.mapCampaign(row);
  }

  async remove(id: string) {
    const campaign = await this.findOne(id);

    if (campaign.status === EmailCampaignStatus.SENDING) {
      throw new BadRequestException(
        'Não é possível excluir uma campanha em envio.',
      );
    }

    await this.prisma.emailCampaign.delete({ where: { id } });
    return { message: 'Campanha excluída com sucesso.' };
  }

  async schedule(id: string, dto: ScheduleEmailCampaignDto) {
    const campaign = await this.findOne(id);

    if (
      campaign.status !== EmailCampaignStatus.DRAFT &&
      campaign.status !== EmailCampaignStatus.SCHEDULED
    ) {
      throw new BadRequestException(
        'Apenas rascunhos ou campanhas já agendadas podem ser reagendadas.',
      );
    }

    const scheduledAt = new Date(dto.scheduledAt);
    if (Number.isNaN(scheduledAt.getTime()) || scheduledAt <= new Date()) {
      throw new BadRequestException('Informe uma data futura para agendamento.');
    }

    const row = await this.prisma.emailCampaign.update({
      where: { id },
      data: {
        status: EmailCampaignStatus.SCHEDULED,
        scheduledAt,
      },
      include: { template: { select: { id: true, name: true } } },
    });

    return this.mapCampaign(row);
  }

  async cancelSchedule(id: string) {
    const campaign = await this.findOne(id);

    if (campaign.status !== EmailCampaignStatus.SCHEDULED) {
      throw new BadRequestException('Esta campanha não está agendada.');
    }

    const row = await this.prisma.emailCampaign.update({
      where: { id },
      data: {
        status: EmailCampaignStatus.CANCELLED,
        scheduledAt: null,
      },
      include: { template: { select: { id: true, name: true } } },
    });

    return this.mapCampaign(row);
  }

  async sendNow(id: string) {
    const campaign = await this.prisma.emailCampaign.findUnique({ where: { id } });
    if (!campaign) throw new NotFoundException('Campanha não encontrada.');

    if (
      campaign.status !== EmailCampaignStatus.DRAFT &&
      campaign.status !== EmailCampaignStatus.SCHEDULED
    ) {
      throw new BadRequestException(
        'Esta campanha não pode ser enviada no status atual.',
      );
    }

    return this.executeCampaign(campaign.id);
  }

  async processScheduledCampaigns() {
    const due = await this.prisma.emailCampaign.findMany({
      where: {
        status: EmailCampaignStatus.SCHEDULED,
        scheduledAt: { lte: new Date() },
      },
      take: 5,
    });

    for (const campaign of due) {
      await this.executeCampaign(campaign.id);
    }
  }

  private async executeCampaign(id: string) {
    const campaign = await this.prisma.emailCampaign.findUnique({ where: { id } });
    if (!campaign) throw new NotFoundException('Campanha não encontrada.');

    const recipients = await this.resolveRecipients(
      campaign.recipientType,
      campaign.recipientEmails,
    );

    if (recipients.length === 0) {
      await this.prisma.emailCampaign.update({
        where: { id },
        data: {
          status: EmailCampaignStatus.FAILED,
          recipientCount: 0,
        },
      });
      throw new BadRequestException('Nenhum destinatário encontrado.');
    }

    await this.prisma.emailCampaign.update({
      where: { id },
      data: {
        status: EmailCampaignStatus.SENDING,
        recipientCount: recipients.length,
        scheduledAt: null,
      },
    });

    let sent = 0;
    let failed = 0;

    for (const recipient of recipients) {
      const result = await this.emailService.sendTemplatedEmail({
        to: recipient.email,
        subject: campaign.subject,
        html: campaign.html,
        text: campaign.text ?? undefined,
        fromName: campaign.fromName,
        fromEmail: campaign.fromEmail,
        replyTo: campaign.replyTo,
        campaignId: campaign.id,
        variables: {
          email: recipient.email,
          nome: recipient.name,
          link: '',
          cupom: '',
          pedido: '',
          codigo: '',
        },
      });

      if (result.status === 'sent') sent += 1;
      else failed += 1;

      await this.delay(120);
    }

    const finalStatus =
      failed === 0
        ? EmailCampaignStatus.SENT
        : sent === 0
          ? EmailCampaignStatus.FAILED
          : EmailCampaignStatus.SENT;

    const updated = await this.prisma.emailCampaign.update({
      where: { id },
      data: {
        status: finalStatus,
        sentAt: new Date(),
        recipientCount: recipients.length,
      },
      include: { template: { select: { id: true, name: true } } },
    });

    return {
      campaign: this.mapCampaign(updated),
      summary: { sent, failed, total: recipients.length },
    };
  }

  private async resolveRecipients(
    recipientType: EmailRecipientType,
    selectedEmails: string[],
  ) {
    if (recipientType === EmailRecipientType.SELECTED) {
      const normalized = [...new Set(selectedEmails.map((e) => e.trim().toLowerCase()))];
      return normalized.map((email) => ({ email, name: email.split('@')[0] }));
    }

    const where: Prisma.NewsletterSubscriberWhereInput =
      recipientType === EmailRecipientType.ALL ? {} : { isActive: true };

    const rows = await this.prisma.newsletterSubscriber.findMany({
      where,
      orderBy: { subscribedAt: 'desc' },
      select: { email: true },
    });

    return rows.map((row) => ({
      email: row.email,
      name: row.email.split('@')[0],
    }));
  }

  private delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private mapCampaign(row: {
    id: string;
    name: string;
    subject: string;
    fromName: string | null;
    fromEmail: string | null;
    replyTo: string | null;
    html: string;
    text: string | null;
    status: EmailCampaignStatus;
    recipientType: EmailRecipientType;
    recipientEmails: string[];
    recipientCount: number;
    templateId: string | null;
    scheduledAt: Date | null;
    sentAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    template?: { id: string; name: string } | null;
  }) {
    return {
      id: row.id,
      name: row.name,
      subject: row.subject,
      fromName: row.fromName,
      fromEmail: row.fromEmail,
      replyTo: row.replyTo,
      html: row.html,
      text: row.text,
      status: row.status,
      recipientType: row.recipientType,
      recipientEmails: row.recipientEmails,
      recipientCount: row.recipientCount,
      templateId: row.templateId,
      template: row.template ?? null,
      scheduledAt: row.scheduledAt?.toISOString() ?? null,
      sentAt: row.sentAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
