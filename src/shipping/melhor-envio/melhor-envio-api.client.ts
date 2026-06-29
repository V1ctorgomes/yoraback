import { Injectable, Logger } from '@nestjs/common';
import { MelhorEnvioEnvironment } from '@prisma/client';
import {
  MelhorEnvioCartPayload,
  MelhorEnvioCartResponse,
  MelhorEnvioPrintResponse,
  MelhorEnvioQuoteRequest,
  MelhorEnvioQuoteService,
  MelhorEnvioTokenResponse,
  MelhorEnvioTrackingEvent,
} from './melhor-envio.types';

const MAX_RETRIES = 3;

@Injectable()
export class MelhorEnvioApiClient {
  private readonly logger = new Logger(MelhorEnvioApiClient.name);

  getBaseUrl(environment: MelhorEnvioEnvironment): string {
    return environment === MelhorEnvioEnvironment.PRODUCTION
      ? 'https://melhorenvio.com.br'
      : 'https://sandbox.melhorenvio.com.br';
  }

  getOAuthAuthorizeUrl(
    environment: MelhorEnvioEnvironment,
    clientId: string,
    redirectUri: string,
  ): string {
    const base = this.getBaseUrl(environment);
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'cart-read cart-write companies-read companies-write coupons-read coupons-write notifications-read orders-read products-read products-write purchases-read shipping-calculate shipping-cancel shipping-checkout shipping-companies shipping-generate shipping-preview shipping-print shipping-share shipping-tracking ecommerce-shipping transactions-read users-read users-write',
    });

    return `${base}/oauth/authorize?${params.toString()}`;
  }

  async exchangeAuthorizationCode(
    environment: MelhorEnvioEnvironment,
    clientId: string,
    clientSecret: string,
    redirectUri: string,
    code: string,
  ): Promise<MelhorEnvioTokenResponse> {
    return this.requestToken(environment, {
      grant_type: 'authorization_code',
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      code,
    });
  }

  async refreshAccessToken(
    environment: MelhorEnvioEnvironment,
    clientId: string,
    clientSecret: string,
    refreshToken: string,
  ): Promise<MelhorEnvioTokenResponse> {
    return this.requestToken(environment, {
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    });
  }

  async calculateQuote(
    environment: MelhorEnvioEnvironment,
    accessToken: string,
    payload: MelhorEnvioQuoteRequest,
  ): Promise<MelhorEnvioQuoteService[]> {
    return this.request<MelhorEnvioQuoteService[]>(
      environment,
      '/api/v2/me/shipment/calculate',
      {
        method: 'POST',
        accessToken,
        body: payload,
      },
    );
  }

  async addToCart(
    environment: MelhorEnvioEnvironment,
    accessToken: string,
    payload: MelhorEnvioCartPayload,
  ): Promise<MelhorEnvioCartResponse> {
    return this.request<MelhorEnvioCartResponse>(
      environment,
      '/api/v2/me/cart',
      {
        method: 'POST',
        accessToken,
        body: payload,
      },
    );
  }

  async checkout(
    environment: MelhorEnvioEnvironment,
    accessToken: string,
    orderIds: string[],
  ): Promise<unknown> {
    return this.request(environment, '/api/v2/me/shipment/checkout', {
      method: 'POST',
      accessToken,
      body: { orders: orderIds },
    });
  }

  async generateLabels(
    environment: MelhorEnvioEnvironment,
    accessToken: string,
    orderIds: string[],
  ): Promise<unknown> {
    return this.request(environment, '/api/v2/me/shipment/generate', {
      method: 'POST',
      accessToken,
      body: { orders: orderIds },
    });
  }

  async printLabels(
    environment: MelhorEnvioEnvironment,
    accessToken: string,
    orderIds: string[],
  ): Promise<MelhorEnvioPrintResponse> {
    return this.request<MelhorEnvioPrintResponse>(
      environment,
      '/api/v2/me/shipment/print',
      {
        method: 'POST',
        accessToken,
        body: { mode: 'private', orders: orderIds },
      },
    );
  }

  async cancelLabel(
    environment: MelhorEnvioEnvironment,
    accessToken: string,
    orderId: string,
    description?: string,
  ): Promise<unknown> {
    return this.request(environment, '/api/v2/me/shipment/cancel', {
      method: 'POST',
      accessToken,
      body: {
        order: { id: orderId, reason_id: 2, description: description ?? 'Cancelamento solicitado' },
      },
    });
  }

  async getTracking(
    environment: MelhorEnvioEnvironment,
    accessToken: string,
    trackingCodes: string[],
  ): Promise<Record<string, MelhorEnvioTrackingEvent[]>> {
    const params = new URLSearchParams();
    for (const code of trackingCodes) {
      params.append('orders[]', code);
    }

    return this.request<Record<string, MelhorEnvioTrackingEvent[]>>(
      environment,
      `/api/v2/me/shipment/tracking?${params.toString()}`,
      { method: 'GET', accessToken },
    );
  }

  private async requestToken(
    environment: MelhorEnvioEnvironment,
    body: Record<string, string>,
  ): Promise<MelhorEnvioTokenResponse> {
    const base = this.getBaseUrl(environment);
    const response = await fetch(`${base}/oauth/token`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'Yora E-commerce (contato@yora.com.br)',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      this.logger.error(`Falha OAuth Melhor Envio: ${errorBody}`);
      throw new Error('Falha na autenticação com Melhor Envio');
    }

    return response.json() as Promise<MelhorEnvioTokenResponse>;
  }

  private async request<T>(
    environment: MelhorEnvioEnvironment,
    path: string,
    options: {
      method: 'GET' | 'POST' | 'DELETE';
      accessToken?: string;
      body?: unknown;
    },
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const base = this.getBaseUrl(environment);
        const response = await fetch(`${base}${path}`, {
          method: options.method,
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            Authorization: options.accessToken
              ? `Bearer ${options.accessToken}`
              : '',
            'User-Agent': 'Yora E-commerce (contato@yora.com.br)',
          },
          body: options.body ? JSON.stringify(options.body) : undefined,
        });

        if (!response.ok) {
          const errorBody = await response.text();
          throw new Error(
            `Melhor Envio ${options.method} ${path} falhou (${response.status}): ${errorBody}`,
          );
        }

        if (response.status === 204) {
          return undefined as T;
        }

        return (await response.json()) as T;
      } catch (error) {
        lastError =
          error instanceof Error ? error : new Error('Erro desconhecido');
        this.logger.warn(
          `Tentativa ${attempt}/${MAX_RETRIES} falhou para ${path}: ${lastError.message}`,
        );

        if (attempt < MAX_RETRIES) {
          await new Promise((resolve) => setTimeout(resolve, attempt * 400));
        }
      }
    }

    throw lastError ?? new Error('Falha na requisição ao Melhor Envio');
  }
}
