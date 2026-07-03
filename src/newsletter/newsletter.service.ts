import {
  ConflictException,
  Injectable,
  NotFoundException,
  StreamableFile,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  ExportAdminNewsletterDto,
  QueryAdminNewsletterDto,
} from './dto/query-admin-newsletter.dto';
import { SubscribeNewsletterDto } from './dto/subscribe-newsletter.dto';

@Injectable()
export class NewsletterService {
  constructor(private prisma: PrismaService) {}

  async subscribe(dto: SubscribeNewsletterDto) {
    const email = dto.email.trim().toLowerCase();
    const existing = await this.prisma.newsletterSubscriber.findUnique({
      where: { email },
    });

    if (existing?.isActive) {
      throw new ConflictException('Este e-mail já está inscrito.');
    }

    if (existing && !existing.isActive) {
      const reactivated = await this.prisma.newsletterSubscriber.update({
        where: { id: existing.id },
        data: {
          isActive: true,
          subscribedAt: new Date(),
          unsubscribedAt: null,
        },
      });

      return {
        message: 'Inscrição reativada com sucesso.',
        subscriber: this.mapSubscriber(reactivated),
      };
    }

    const subscriber = await this.prisma.newsletterSubscriber.create({
      data: { email },
    });

    return {
      message: 'Inscrição realizada com sucesso.',
      subscriber: this.mapSubscriber(subscriber),
    };
  }

  async unsubscribe(email: string) {
    const normalized = email.trim().toLowerCase();
    const existing = await this.prisma.newsletterSubscriber.findUnique({
      where: { email: normalized },
    });

    if (!existing) {
      throw new NotFoundException('Inscrição não encontrada.');
    }

    if (!existing.isActive) {
      return {
        message: 'Esta inscrição já estava cancelada.',
        subscriber: this.mapSubscriber(existing),
      };
    }

    const updated = await this.prisma.newsletterSubscriber.update({
      where: { id: existing.id },
      data: {
        isActive: false,
        unsubscribedAt: new Date(),
      },
    });

    return {
      message: 'Inscrição cancelada com sucesso.',
      subscriber: this.mapSubscriber(updated),
    };
  }

  async findAllAdmin(query: QueryAdminNewsletterDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where = this.buildWhere(query);

    const [total, rows, stats] = await Promise.all([
      this.prisma.newsletterSubscriber.count({ where }),
      this.prisma.newsletterSubscriber.findMany({
        where,
        orderBy: { subscribedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.getStats(),
    ]);

    return {
      stats,
      data: rows.map((row) => this.mapSubscriber(row)),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async export(query: ExportAdminNewsletterDto) {
    const where = this.buildWhere(query);
    const rows = await this.prisma.newsletterSubscriber.findMany({
      where,
      orderBy: { subscribedAt: 'desc' },
    });

    const mapped = rows.map((row) => this.mapSubscriber(row));
    const format = query.format ?? 'csv';

    if (format === 'xlsx') {
      return this.buildXlsxExport(mapped);
    }

    return this.buildCsvExport(mapped);
  }

  private async getStats() {
    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [total, active, cancelled, recent] = await Promise.all([
      this.prisma.newsletterSubscriber.count(),
      this.prisma.newsletterSubscriber.count({ where: { isActive: true } }),
      this.prisma.newsletterSubscriber.count({ where: { isActive: false } }),
      this.prisma.newsletterSubscriber.count({
        where: {
          isActive: true,
          subscribedAt: { gte: thirtyDaysAgo },
        },
      }),
    ]);

    return {
      total,
      active,
      cancelled,
      recent,
    };
  }

  private buildWhere(
    query: QueryAdminNewsletterDto,
  ): Prisma.NewsletterSubscriberWhereInput {
    const where: Prisma.NewsletterSubscriberWhereInput = {};

    if (query.isActive !== undefined) {
      where.isActive = query.isActive;
    }

    if (query.search?.trim()) {
      where.email = {
        contains: query.search.trim().toLowerCase(),
        mode: 'insensitive',
      };
    }

    if (query.subscribedFrom || query.subscribedTo) {
      where.subscribedAt = {
        ...(query.subscribedFrom
          ? { gte: new Date(query.subscribedFrom) }
          : {}),
        ...(query.subscribedTo ? { lte: new Date(query.subscribedTo) } : {}),
      };
    }

    return where;
  }

  private mapSubscriber(subscriber: {
    id: string;
    email: string;
    isActive: boolean;
    subscribedAt: Date;
    unsubscribedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: subscriber.id,
      email: subscriber.email,
      isActive: subscriber.isActive,
      subscribedAt: subscriber.subscribedAt.toISOString(),
      unsubscribedAt: subscriber.unsubscribedAt?.toISOString() ?? null,
      createdAt: subscriber.createdAt.toISOString(),
      updatedAt: subscriber.updatedAt.toISOString(),
    };
  }

  private buildCsvExport(
    rows: ReturnType<NewsletterService['mapSubscriber']>[],
  ) {
    const header = ['Email', 'Status', 'Inscrito em', 'Cancelado em'];
    const lines = rows.map((row) =>
      [
        row.email,
        row.isActive ? 'Ativo' : 'Inativo',
        row.subscribedAt,
        row.unsubscribedAt ?? '',
      ]
        .map((value) => `"${String(value).replace(/"/g, '""')}"`)
        .join(','),
    );

    const content = [header.join(','), ...lines].join('\n');
    const buffer = Buffer.from(`\uFEFF${content}`, 'utf8');

    return new StreamableFile(buffer, {
      type: 'text/csv; charset=utf-8',
      disposition: 'attachment; filename="newsletter-inscritos.csv"',
    });
  }

  private async buildXlsxExport(
    rows: ReturnType<NewsletterService['mapSubscriber']>[],
  ) {
    const ExcelJS = await import('exceljs');
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Newsletter');

    sheet.columns = [
      { header: 'Email', key: 'email', width: 36 },
      { header: 'Status', key: 'status', width: 12 },
      { header: 'Inscrito em', key: 'subscribedAt', width: 24 },
      { header: 'Cancelado em', key: 'unsubscribedAt', width: 24 },
    ];

    for (const row of rows) {
      sheet.addRow({
        email: row.email,
        status: row.isActive ? 'Ativo' : 'Inativo',
        subscribedAt: row.subscribedAt,
        unsubscribedAt: row.unsubscribedAt ?? '',
      });
    }

    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

    return new StreamableFile(buffer, {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      disposition: 'attachment; filename="newsletter-inscritos.xlsx"',
    });
  }
}
