import { Injectable } from '@nestjs/common';
import {
  EmailProvider,
  SendEmailInput,
  SendEmailResult,
} from './email-provider.interface';

const RESEND_API = 'https://api.resend.com';
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_RETRIES = 3;

@Injectable()
export class ResendProvider implements EmailProvider {
  readonly name = 'resend';

  constructor(private readonly apiKey: string) {}

  static sanitizeApiKey(raw: string): string {
    return raw
      .trim()
      .replace(/^Bearer\s+/i, '')
      .replace(/^["']|["']$/g, '');
  }

  async testConnection(): Promise<{ ok: boolean; message: string }> {
    try {
      const response = await this.request('/domains', { method: 'GET' });

      if (response.status === 401 || response.status === 403) {
        return {
          ok: false,
          message: 'API Key inválida ou sem permissão no Resend.',
        };
      }

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        const message =
          typeof body.message === 'string'
            ? body.message
            : 'Não foi possível validar a conexão com o Resend.';
        return { ok: false, message };
      }

      return {
        ok: true,
        message: 'Conexão com o Resend validada com sucesso.',
      };
    } catch {
      return {
        ok: false,
        message: 'Não foi possível conectar ao Resend. Verifique a API Key.',
      };
    }
  }

  async sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
    let lastError = 'Falha ao enviar e-mail.';

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await this.request('/emails', {
          method: 'POST',
          body: JSON.stringify({
            from: input.from,
            to: [input.to],
            subject: input.subject,
            html: input.html,
            text: input.text,
            reply_to: input.replyTo,
          }),
        });

        const body = await response.json().catch(() => ({}));

        if (response.ok && typeof body.id === 'string') {
          return {
            providerId: body.id,
            status: 'sent',
          };
        }

        lastError =
          typeof body.message === 'string'
            ? body.message
            : `Erro HTTP ${response.status} ao enviar e-mail.`;

        if (response.status >= 400 && response.status < 500) {
          break;
        }
      } catch (error) {
        lastError =
          error instanceof Error ? error.message : 'Erro de rede ao enviar.';
      }

      if (attempt < MAX_RETRIES) {
        await this.delay(attempt * 500);
      }
    }

    return {
      providerId: null,
      status: 'failed',
      message: lastError,
    };
  }

  private async request(path: string, init: RequestInit) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      return await fetch(`${RESEND_API}${path}`, {
        ...init,
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          ...(init.headers ?? {}),
        },
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  private delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
