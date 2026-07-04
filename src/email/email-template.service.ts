import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateEmailTemplateDto,
  UpdateEmailTemplateDto,
} from './dto/email-template.dto';
import { extractTemplateVariables } from './email-template.util';

@Injectable()
export class EmailTemplateService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    const rows = await this.prisma.emailTemplate.findMany({
      orderBy: { updatedAt: 'desc' },
    });

    return rows.map((row) => this.mapTemplate(row));
  }

  async findOne(id: string) {
    const row = await this.prisma.emailTemplate.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Template não encontrado.');
    return this.mapTemplate(row);
  }

  async create(dto: CreateEmailTemplateDto) {
    const variables = this.collectVariables(dto.html, dto.text);
    const row = await this.prisma.emailTemplate.create({
      data: {
        name: dto.name.trim(),
        subject: dto.subject.trim(),
        html: dto.html,
        text: dto.text,
        variables,
      },
    });

    return this.mapTemplate(row);
  }

  async update(id: string, dto: UpdateEmailTemplateDto) {
    await this.findOne(id);

    const html = dto.html;
    const text = dto.text;
    const variables =
      html !== undefined || text !== undefined
        ? this.collectVariables(html ?? '', text)
        : undefined;

    const row = await this.prisma.emailTemplate.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.subject !== undefined ? { subject: dto.subject.trim() } : {}),
        ...(dto.html !== undefined ? { html: dto.html } : {}),
        ...(dto.text !== undefined ? { text: dto.text } : {}),
        ...(variables !== undefined ? { variables } : {}),
      },
    });

    return this.mapTemplate(row);
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.emailTemplate.delete({ where: { id } });
    return { message: 'Template excluído com sucesso.' };
  }

  private collectVariables(html: string, text?: string | null) {
    const fromHtml = extractTemplateVariables(html);
    const fromText = text ? extractTemplateVariables(text) : [];
    return [...new Set([...fromHtml, ...fromText])];
  }

  private mapTemplate(row: {
    id: string;
    name: string;
    subject: string;
    html: string;
    text: string | null;
    variables: string[];
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: row.id,
      name: row.name,
      subject: row.subject,
      html: row.html,
      text: row.text,
      variables: row.variables,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
