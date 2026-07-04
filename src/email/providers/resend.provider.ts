import { Injectable } from '@nestjs/common';
import {
  EmailProvider,
  SendEmailInput,
  SendEmailResult,
  UpsertContactInput,
  UpsertContactResult,
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

  async upsertContact(input: UpsertContactInput): Promise<UpsertContactResult> {
    const email = input.email.trim().toLowerCase();
    const firstName = input.firstName?.trim() || email.split('@')[0];
    const body: Record<string, unknown> = {
      email,
      first_name: firstName,
      unsubscribed: false,
    };

    if (input.segmentId) {
      body.segments = [{ id: input.segmentId }];
    }

    const created = await this.request('/contacts', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    const createdBody = await created.json().catch(() => ({}));

    if (created.ok && typeof createdBody.id === 'string') {
      return { ok: true, contactId: createdBody.id };
    }

    const updated = await this.request(`/contacts/${encodeURIComponent(email)}`, {
      method: 'PATCH',
      body: JSON.stringify({
        first_name: firstName,
        unsubscribed: false,
      }),
    });
    const updatedBody = await updated.json().catch(() => ({}));

    if (!updated.ok) {
      return {
        ok: false,
        contactId: null,
        message:
          typeof updatedBody.message === 'string'
            ? updatedBody.message
            : typeof createdBody.message === 'string'
              ? createdBody.message
              : 'Não foi possível sincronizar contato no Resend.',
      };
    }

    if (input.segmentId) {
      const segment = await this.request(
        `/contacts/${encodeURIComponent(email)}/segments/${input.segmentId}`,
        { method: 'POST' },
      );

      if (!segment.ok) {
        const segmentBody = await segment.json().catch(() => ({}));
        return {
          ok: false,
          contactId:
            typeof updatedBody.id === 'string' ? updatedBody.id : null,
          message:
            typeof segmentBody.message === 'string'
              ? segmentBody.message
              : 'Contato criado, mas não foi adicionado ao segmento.',
        };
      }
    }

    return {
      ok: true,
      contactId:
        typeof updatedBody.id === 'string' ? updatedBody.id : null,
    };
  }

  async unsubscribeContact(email: string): Promise<UpsertContactResult> {
    const normalized = email.trim().toLowerCase();
    const response = await this.request(
      `/contacts/${encodeURIComponent(normalized)}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ unsubscribed: true }),
      },
    );
    const body = await response.json().catch(() => ({}));

    if (response.ok) {
      return {
        ok: true,
        contactId: typeof body.id === 'string' ? body.id : null,
      };
    }

    if (response.status === 404) {
      return { ok: true, contactId: null };
    }

    return {
      ok: false,
      contactId: null,
      message:
        typeof body.message === 'string'
          ? body.message
          : 'Não foi possível cancelar contato no Resend.',
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
