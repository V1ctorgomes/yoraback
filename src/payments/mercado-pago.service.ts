import { createHmac } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MercadoPagoConfig, Payment } from 'mercadopago';
import { MercadoPagoPaymentResponse } from './payment-status.mapper';

export interface CreateMercadoPagoPaymentInput {
  amount: number;
  description: string;
  orderNumber: string;
  payerEmail: string;
  payerFirstName: string;
  paymentMethod: 'PIX' | 'CREDIT_CARD';
  token?: string;
  paymentMethodId?: string;
  installments?: number;
  issuerId?: string;
}

@Injectable()
export class MercadoPagoService {
  private readonly logger = new Logger(MercadoPagoService.name);
  private readonly paymentClient: Payment | null;
  private readonly enabled: boolean;
  private readonly environment: string;

  constructor(private config: ConfigService) {
    const accessToken = this.config.get<string>('MERCADOPAGO_ACCESS_TOKEN');
    this.environment = this.config.get<string>('MERCADOPAGO_ENV', 'sandbox');
    this.enabled = Boolean(accessToken);

    if (this.enabled) {
      const client = new MercadoPagoConfig({ accessToken: accessToken! });
      this.paymentClient = new Payment(client);
    } else {
      this.paymentClient = null;
      this.logger.warn(
        'MERCADOPAGO_ACCESS_TOKEN não configurado. Pagamentos usarão modo simulado.',
      );
    }
  }

  isEnabled() {
    return this.enabled;
  }

  getEnvironment() {
    return this.environment;
  }

  getPublicKey() {
    return this.config.get<string>('MERCADOPAGO_PUBLIC_KEY', '');
  }

  async createPayment(input: CreateMercadoPagoPaymentInput) {
    if (!this.paymentClient) {
      return this.createSimulatedPayment(input);
    }

    const notificationUrl = this.buildNotificationUrl();
    const body: Record<string, unknown> = {
      transaction_amount: input.amount,
      description: input.description,
      external_reference: input.orderNumber,
      payer: {
        email: input.payerEmail,
        first_name: input.payerFirstName,
      },
      notification_url: notificationUrl,
    };

    if (input.paymentMethod === 'PIX') {
      body.payment_method_id = 'pix';
      body.date_of_expiration = new Date(
        Date.now() + 30 * 60 * 1000,
      ).toISOString();
    } else {
      body.token = input.token;
      body.installments = input.installments ?? 1;
      body.payment_method_id = input.paymentMethodId;
      if (input.issuerId) {
        body.issuer_id = input.issuerId;
      }
    }

    const response = await this.paymentClient.create({ body });
    return response as MercadoPagoPaymentResponse;
  }

  async getPayment(providerPaymentId: string) {
    if (!this.paymentClient) {
      throw new Error('Mercado Pago não configurado');
    }

    const response = await this.paymentClient.get({ id: providerPaymentId });
    return response as MercadoPagoPaymentResponse;
  }

  validateWebhookSignature(params: {
    signatureHeader?: string;
    requestId?: string;
    dataId?: string;
  }) {
    const secret = this.config.get<string>('MERCADOPAGO_WEBHOOK_SECRET');
    if (!secret) {
      return true;
    }

    const { signatureHeader, requestId, dataId } = params;
    if (!signatureHeader || !requestId || !dataId) {
      return false;
    }

    const parts = Object.fromEntries(
      signatureHeader.split(',').map((part) => part.trim().split('=')),
    ) as Record<string, string>;

    const ts = parts.ts;
    const signature = parts.v1;
    if (!ts || !signature) {
      return false;
    }

    const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
    const expected = createHmac('sha256', secret)
      .update(manifest)
      .digest('hex');

    return expected === signature;
  }

  private buildNotificationUrl() {
    const apiUrl = this.config.get<string>(
      'API_PUBLIC_URL',
      'http://localhost:3001',
    );
    return `${apiUrl.replace(/\/$/, '')}/payments/webhook/mercadopago`;
  }

  private createSimulatedPayment(input: CreateMercadoPagoPaymentInput) {
    const id = Date.now();
    const pixCode = `00020126580014BR.GOV.BCB.PIX0136${id}520400005303986540${input.amount.toFixed(2)}5802BR5925YORA E-COMMERCE6009SAO PAULO62070503***6304ABCD`;

    if (input.paymentMethod === 'PIX') {
      return {
        id,
        status: 'pending',
        transaction_amount: input.amount,
        date_of_expiration: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        point_of_interaction: {
          transaction_data: {
            qr_code: pixCode,
            qr_code_base64: '',
            ticket_url: pixCode,
          },
        },
      } satisfies MercadoPagoPaymentResponse;
    }

    return {
      id,
      status: 'approved',
      transaction_amount: input.amount,
      payment_method_id: input.paymentMethodId ?? 'visa',
    } satisfies MercadoPagoPaymentResponse;
  }
}
