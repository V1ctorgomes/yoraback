import { Injectable } from '@nestjs/common';
import { EmailLogStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { renderTemplate } from './email-template.util';
import { EmailSettingsService } from './email-settings.service';
import {
  SendEmailInput,
  SendEmailResult,
} from './providers/email-provider.interface';

export interface SendTemplatedEmailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
  fromName?: string | null;
  fromEmail?: string | null;
  replyTo?: string | null;
  variables?: Record<string, string>;
  campaignId?: string;
}

@Injectable()
export class EmailService {
  constructor(
    private prisma: PrismaService,
    private settingsService: EmailSettingsService,
  ) {}

  async sendTemplatedEmail(input: SendTemplatedEmailInput) {
    const { settings, provider } = await this.settingsService.getProvider();
    const variables = input.variables ?? {};

    const subject = renderTemplate(input.subject, variables);
    const html = renderTemplate(input.html, variables);
    const text = input.text ? renderTemplate(input.text, variables) : undefined;

    const fromName = input.fromName ?? settings.fromName;
    const fromEmail = input.fromEmail ?? settings.fromEmail;
    const replyTo = input.replyTo ?? settings.replyTo;

    const from = fromName && fromEmail
      ? `${fromName} <${fromEmail}>`
      : this.settingsService.getFromAddress({
          fromName,
          fromEmail,
        });

    const payload: SendEmailInput = {
      from,
      to: input.to.trim().toLowerCase(),
      subject,
      html,
      text,
      replyTo: replyTo ?? undefined,
    };

    const result = await provider.sendEmail(payload);
    await this.createLog({
      campaignId: input.campaignId,
      recipient: payload.to,
      result,
    });

    return result;
  }

  async testConnection(apiKey?: string) {
    return this.settingsService.testConnection(
      apiKey ? { apiKey } : {},
    );
  }

  private async createLog(input: {
    campaignId?: string;
    recipient: string;
    result: SendEmailResult;
  }) {
    const status: EmailLogStatus =
      input.result.status === 'sent' ? EmailLogStatus.SENT : EmailLogStatus.FAILED;

    return this.prisma.emailLog.create({
      data: {
        campaignId: input.campaignId,
        recipient: input.recipient,
        status,
        providerId: input.result.providerId,
        message: input.result.message,
      },
    });
  }
}
