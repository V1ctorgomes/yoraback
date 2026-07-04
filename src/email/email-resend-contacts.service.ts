import { Injectable, Logger } from '@nestjs/common';
import { EmailSettingsService } from './email-settings.service';

@Injectable()
export class EmailResendContactsService {
  private readonly logger = new Logger(EmailResendContactsService.name);

  constructor(private settingsService: EmailSettingsService) {}

  async syncNewsletterSubscribe(email: string) {
    const config = await this.getSyncConfig();
    if (!config) return { synced: false, reason: 'sync_disabled' as const };

    try {
      const { provider } = await this.settingsService.getProvider();
      const result = await provider.upsertContact({
        email,
        firstName: email.split('@')[0],
        segmentId: config.segmentId,
      });

      if (!result.ok) {
        this.logger.warn(
          `Falha ao sincronizar inscrito ${email} no Resend: ${result.message ?? 'erro desconhecido'}`,
        );
        return { synced: false, reason: 'provider_error' as const, message: result.message };
      }

      return { synced: true, contactId: result.contactId };
    } catch (error) {
      this.logger.warn(
        `Erro ao sincronizar inscrito ${email} no Resend: ${
          error instanceof Error ? error.message : 'erro desconhecido'
        }`,
      );
      return { synced: false, reason: 'provider_error' as const };
    }
  }

  async syncNewsletterUnsubscribe(email: string) {
    const config = await this.getSyncConfig();
    if (!config) return { synced: false, reason: 'sync_disabled' as const };

    try {
      const { provider } = await this.settingsService.getProvider();
      const result = await provider.unsubscribeContact(email);

      if (!result.ok) {
        this.logger.warn(
          `Falha ao cancelar contato ${email} no Resend: ${result.message ?? 'erro desconhecido'}`,
        );
        return { synced: false, reason: 'provider_error' as const, message: result.message };
      }

      return { synced: true, contactId: result.contactId };
    } catch (error) {
      this.logger.warn(
        `Erro ao cancelar contato ${email} no Resend: ${
          error instanceof Error ? error.message : 'erro desconhecido'
        }`,
      );
      return { synced: false, reason: 'provider_error' as const };
    }
  }

  async syncAllActiveSubscribers(emails: string[]) {
    const results = {
      total: emails.length,
      synced: 0,
      failed: 0,
      skipped: 0,
    };

    const config = await this.getSyncConfig();
    if (!config) {
      return { ...results, skipped: emails.length, reason: 'sync_disabled' as const };
    }

    for (const email of emails) {
      const result = await this.syncNewsletterSubscribe(email);
      if (result.synced) results.synced += 1;
      else results.failed += 1;
      await this.delay(150);
    }

    return results;
  }

  private async getSyncConfig() {
    const settings = await this.settingsService.getSettings();
    if (!settings.resendSyncEnabled || !settings.resendSegmentId) {
      return null;
    }

    return {
      segmentId: settings.resendSegmentId,
    };
  }

  private delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
