import { Injectable } from '@nestjs/common';
import { EmailCampaignStatus, EmailLogStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { QueryEmailLogsDto } from './dto/email-campaign.dto';

@Injectable()
export class EmailDashboardService {
  constructor(private prisma: PrismaService) {}

  async getDashboard() {
    const [
      subscribersTotal,
      subscribersActive,
      campaignsCreated,
      campaignsSent,
      logsSent,
      logsDelivered,
      logsFailed,
      logsRejected,
      lastLog,
    ] = await Promise.all([
      this.prisma.newsletterSubscriber.count(),
      this.prisma.newsletterSubscriber.count({ where: { isActive: true } }),
      this.prisma.emailCampaign.count(),
      this.prisma.emailCampaign.count({
        where: { status: EmailCampaignStatus.SENT },
      }),
      this.prisma.emailLog.count({ where: { status: EmailLogStatus.SENT } }),
      this.prisma.emailLog.count({
        where: { status: EmailLogStatus.DELIVERED },
      }),
      this.prisma.emailLog.count({ where: { status: EmailLogStatus.FAILED } }),
      this.prisma.emailLog.count({
        where: { status: EmailLogStatus.REJECTED },
      }),
      this.prisma.emailLog.findFirst({
        orderBy: { createdAt: 'desc' },
        include: {
          campaign: { select: { id: true, name: true } },
        },
      }),
    ]);

    return {
      subscribers: {
        total: subscribersTotal,
        active: subscribersActive,
      },
      campaigns: {
        created: campaignsCreated,
        sent: campaignsSent,
      },
      emails: {
        sent: logsSent,
        delivered: logsDelivered,
        failed: logsFailed,
        rejected: logsRejected,
        bounce: logsRejected,
      },
      lastSend: lastLog
        ? {
            id: lastLog.id,
            recipient: lastLog.recipient,
            status: lastLog.status,
            campaign: lastLog.campaign,
            createdAt: lastLog.createdAt.toISOString(),
          }
        : null,
    };
  }

  async findLogs(query: QueryEmailLogsDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const where: {
      campaignId?: string;
      recipient?: { contains: string; mode: 'insensitive' };
    } = {};

    if (query.campaignId) where.campaignId = query.campaignId;
    if (query.search?.trim()) {
      where.recipient = {
        contains: query.search.trim().toLowerCase(),
        mode: 'insensitive',
      };
    }

    const [total, rows] = await Promise.all([
      this.prisma.emailLog.count({ where }),
      this.prisma.emailLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          campaign: { select: { id: true, name: true } },
        },
      }),
    ]);

    return {
      data: rows.map((row) => ({
        id: row.id,
        campaignId: row.campaignId,
        campaign: row.campaign,
        recipient: row.recipient,
        status: row.status,
        providerId: row.providerId,
        message: row.message,
        createdAt: row.createdAt.toISOString(),
      })),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }
}
