import {
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EmailEncryptionService } from './email-encryption.service';
import {
  TestEmailConnectionDto,
  UpdateEmailSettingsDto,
} from './dto/update-email-settings.dto';
import { ResendProvider } from './providers/resend.provider';

@Injectable()
export class EmailSettingsService {
  constructor(
    private prisma: PrismaService,
    private encryption: EmailEncryptionService,
  ) {}

  async getSettings() {
    const settings = await this.ensureSettings();
    return this.mapSettings(settings, false);
  }

  async updateSettings(dto: UpdateEmailSettingsDto) {
    const current = await this.ensureSettings();
    const data: Record<string, unknown> = {};

    if (dto.provider !== undefined) data.provider = dto.provider;
    if (dto.domain !== undefined) data.domain = dto.domain?.trim() || null;
    if (dto.fromName !== undefined) data.fromName = dto.fromName?.trim() || null;
    if (dto.fromEmail !== undefined) {
      data.fromEmail = dto.fromEmail?.trim().toLowerCase() || null;
    }
    if (dto.replyTo !== undefined) {
      data.replyTo = dto.replyTo?.trim().toLowerCase() || null;
    }
    if (dto.sandbox !== undefined) data.sandbox = dto.sandbox;

    if (dto.apiKey !== undefined) {
      const sanitized = ResendProvider.sanitizeApiKey(dto.apiKey);
      data.apiKey = sanitized ? this.encryption.encrypt(sanitized) : null;
    }

    const updated = await this.prisma.emailSettings.update({
      where: { id: current.id },
      data,
    });

    return this.mapSettings(updated, false);
  }

  async testConnection(dto: TestEmailConnectionDto = {}) {
    const settings = await this.ensureSettings();
    const apiKey = dto.apiKey
      ? ResendProvider.sanitizeApiKey(dto.apiKey)
      : this.getDecryptedApiKey(settings.apiKey);

    if (!apiKey) {
      throw new BadRequestException('Informe a API Key do Resend.');
    }

    const provider = new ResendProvider(apiKey);
    return provider.testConnection();
  }

  async getProvider() {
    const settings = await this.ensureSettings();
    const apiKey = this.getDecryptedApiKey(settings.apiKey);

    if (!apiKey) {
      throw new BadRequestException(
        'Configure a API Key do Resend antes de enviar e-mails.',
      );
    }

    if (settings.provider !== 'resend') {
      throw new BadRequestException(
        `Provider "${settings.provider}" ainda não está implementado.`,
      );
    }

    return {
      settings,
      provider: new ResendProvider(apiKey),
    };
  }

  getFromAddress(settings: {
    fromName: string | null;
    fromEmail: string | null;
  }) {
    if (!settings.fromEmail) {
      throw new BadRequestException(
        'Configure o e-mail remetente nas configurações de e-mail.',
      );
    }

    if (settings.fromName) {
      return `${settings.fromName} <${settings.fromEmail}>`;
    }

    return settings.fromEmail;
  }

  private async ensureSettings() {
    const existing = await this.prisma.emailSettings.findFirst({
      orderBy: { createdAt: 'asc' },
    });

    if (existing) return existing;

    return this.prisma.emailSettings.create({
      data: { provider: 'resend', sandbox: true },
    });
  }

  private getDecryptedApiKey(encrypted: string | null) {
    if (!encrypted) return null;
    try {
      return this.encryption.decrypt(encrypted);
    } catch {
      return null;
    }
  }

  private mapSettings(
    settings: {
      id: string;
      provider: string;
      apiKey: string | null;
      domain: string | null;
      fromName: string | null;
      fromEmail: string | null;
      replyTo: string | null;
      sandbox: boolean;
      createdAt: Date;
      updatedAt: Date;
    },
    includeApiKey: boolean,
  ) {
    return {
      id: settings.id,
      provider: settings.provider,
      hasApiKey: Boolean(settings.apiKey),
      apiKey: includeApiKey ? this.getDecryptedApiKey(settings.apiKey) : undefined,
      domain: settings.domain,
      fromName: settings.fromName,
      fromEmail: settings.fromEmail,
      replyTo: settings.replyTo,
      sandbox: settings.sandbox,
      createdAt: settings.createdAt.toISOString(),
      updatedAt: settings.updatedAt.toISOString(),
    };
  }
}
