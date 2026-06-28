import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  OrderStatus,
  PaymentMethodType,
  PaymentProvider,
  PaymentStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OrderExpirationService } from '../orders/order-expiration.service';
import { canTransitionStatus } from '../orders/order-status.transitions';
import { CreatePaymentDto, SimulatePaymentDto } from './dto/create-payment.dto';
import { QueryAdminPaymentsDto } from './dto/query-admin-payments.dto';
import { MercadoPagoService } from './mercado-pago.service';
import { mapMercadoPagoStatus } from './payment-status.mapper';

const paymentInclude = {
  order: {
    select: {
      id: true,
      orderNumber: true,
      status: true,
      total: true,
      customerName: true,
      customerEmail: true,
    },
  },
} satisfies Prisma.PaymentInclude;

type PaymentWithOrder = Prisma.PaymentGetPayload<{
  include: typeof paymentInclude;
}>;

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private prisma: PrismaService,
    private mercadoPago: MercadoPagoService,
    private orderExpiration: OrderExpirationService,
  ) {}

  getPublicConfig() {
    return {
      publicKey: this.mercadoPago.getPublicKey(),
      environment: this.mercadoPago.getEnvironment(),
      enabled: this.mercadoPago.isEnabled(),
    };
  }

  async createPayment(dto: CreatePaymentDto) {
    await this.orderExpiration.expireByOrderNumber(dto.orderNumber);

    const order = await this.prisma.order.findUnique({
      where: { orderNumber: dto.orderNumber },
    });

    if (!order) {
      throw new NotFoundException('Pedido não encontrado');
    }

    if (order.status !== OrderStatus.WAITING_PAYMENT) {
      throw new BadRequestException(
        'Este pedido não está aguardando pagamento',
      );
    }

    if (!this.orderExpiration.isPaymentWindowOpen(order.paymentExpiresAt)) {
      throw new BadRequestException(
        'O prazo de pagamento deste pedido expirou',
      );
    }

    if (dto.paymentMethod === PaymentMethodType.CREDIT_CARD) {
      if (!dto.token) {
        throw new BadRequestException('Token do cartão é obrigatório');
      }
      if (!dto.paymentMethodId) {
        throw new BadRequestException('Bandeira do cartão é obrigatória');
      }
    }

    const amount = Number(order.total);
    const mpResponse = await this.mercadoPago.createPayment({
      amount,
      description: `Pedido ${order.orderNumber}`,
      orderNumber: order.orderNumber,
      payerEmail: order.customerEmail,
      payerFirstName: order.customerName.split(' ')[0] ?? order.customerName,
      paymentMethod:
        dto.paymentMethod === PaymentMethodType.PIX ? 'PIX' : 'CREDIT_CARD',
      token: dto.token,
      paymentMethodId: dto.paymentMethodId,
      installments: dto.installments,
      issuerId: dto.issuerId,
    });

    const status = mapMercadoPagoStatus(mpResponse.status);
    const pixData = mpResponse.point_of_interaction?.transaction_data;

    const payment = await this.prisma.payment.create({
      data: {
        orderId: order.id,
        provider: PaymentProvider.MERCADO_PAGO,
        providerPaymentId: mpResponse.id ? String(mpResponse.id) : null,
        paymentMethod: dto.paymentMethod,
        amount,
        status,
        installments: dto.installments ?? null,
        pixQrCode: pixData?.ticket_url ?? null,
        pixQrCodeBase64: pixData?.qr_code_base64 ?? null,
        pixCopyPaste: pixData?.qr_code ?? null,
        pixExpiresAt: mpResponse.date_of_expiration
          ? new Date(mpResponse.date_of_expiration)
          : null,
        rawResponse: mpResponse as Prisma.InputJsonValue,
      },
      include: paymentInclude,
    });

    if (status === PaymentStatus.APPROVED) {
      await this.syncOrderStatus(payment.orderId, status);
    }

    return this.mapPayment(payment);
  }

  async findById(id: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id },
      include: paymentInclude,
    });

    if (!payment) {
      throw new NotFoundException('Pagamento não encontrado');
    }

    if (
      payment.providerPaymentId &&
      payment.status === PaymentStatus.PENDING &&
      this.mercadoPago.isEnabled()
    ) {
      try {
        const mpPayment = await this.mercadoPago.getPayment(
          payment.providerPaymentId,
        );
        const nextStatus = mapMercadoPagoStatus(mpPayment.status);

        if (nextStatus !== payment.status) {
          const updated = await this.prisma.payment.update({
            where: { id },
            data: {
              status: nextStatus,
              rawResponse: mpPayment as Prisma.InputJsonValue,
            },
            include: paymentInclude,
          });

          await this.syncOrderStatus(updated.orderId, nextStatus);
          return this.mapPayment(updated);
        }
      } catch (error) {
        this.logger.warn(
          `Falha ao consultar pagamento ${payment.providerPaymentId}: ${error}`,
        );
      }
    }

    return this.mapPayment(payment);
  }

  async findLatestByOrderNumber(orderNumber: string) {
    await this.orderExpiration.expireByOrderNumber(orderNumber);

    const order = await this.prisma.order.findUnique({
      where: { orderNumber },
      select: { id: true, status: true },
    });

    if (!order) {
      throw new NotFoundException('Pedido não encontrado');
    }

    if (order.status !== OrderStatus.WAITING_PAYMENT) {
      return null;
    }

    const payment = await this.prisma.payment.findFirst({
      where: { orderId: order.id },
      orderBy: { createdAt: 'desc' },
      include: paymentInclude,
    });

    if (!payment) {
      return null;
    }

    if (this.isRetryablePayment(payment)) {
      return null;
    }

    return this.findById(payment.id);
  }

  private isRetryablePayment(payment: PaymentWithOrder) {
    if (payment.status === PaymentStatus.REJECTED) {
      return true;
    }

    if (
      payment.status === PaymentStatus.PENDING &&
      payment.pixExpiresAt &&
      payment.pixExpiresAt <= new Date()
    ) {
      return true;
    }

    return false;
  }

  async handleWebhook(
    body: Record<string, unknown>,
    headers: Record<string, string | undefined>,
  ) {
    const dataId =
      typeof body.data === 'object' &&
      body.data !== null &&
      'id' in body.data
        ? String((body.data as { id: unknown }).id)
        : undefined;

    const isValid = this.mercadoPago.validateWebhookSignature({
      signatureHeader: headers['x-signature'],
      requestId: headers['x-request-id'],
      dataId,
    });

    if (!isValid) {
      throw new UnauthorizedException('Assinatura do webhook inválida');
    }

    const eventKey = this.buildWebhookEventKey(body, dataId);

    const existingEvent = await this.prisma.paymentWebhookEvent.findUnique({
      where: { providerEventKey: eventKey },
    });

    if (existingEvent) {
      this.logger.log(`Webhook duplicado ignorado: ${eventKey}`);
      return { received: true, duplicate: true };
    }

    await this.prisma.paymentWebhookEvent.create({
      data: {
        providerEventKey: eventKey,
        payload: body as Prisma.InputJsonValue,
      },
    });

    if (body.type !== 'payment' || !dataId) {
      return { received: true, processed: false };
    }

    await this.processProviderPayment(dataId);
    return { received: true, processed: true };
  }

  async simulatePayment(dto: SimulatePaymentDto) {
    if (
      this.mercadoPago.isEnabled() &&
      this.mercadoPago.getEnvironment() === 'production'
    ) {
      throw new BadRequestException(
        'Simulação não disponível em produção',
      );
    }

    const payment = await this.prisma.payment.findUnique({
      where: { id: dto.paymentId },
      include: paymentInclude,
    });

    if (!payment) {
      throw new NotFoundException('Pagamento não encontrado');
    }

    const nextStatus =
      dto.status === 'APPROVED'
        ? PaymentStatus.APPROVED
        : PaymentStatus.REJECTED;

    const updated = await this.prisma.payment.update({
      where: { id: payment.id },
      data: { status: nextStatus },
      include: paymentInclude,
    });

    await this.syncOrderStatus(updated.orderId, nextStatus);
    return this.mapPayment(updated);
  }

  async findAllAdmin(query: QueryAdminPaymentsDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;
    const where = this.buildAdminWhere(query);

    const [payments, total] = await Promise.all([
      this.prisma.payment.findMany({
        where,
        include: paymentInclude,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.payment.count({ where }),
    ]);

    return {
      data: payments.map((payment) => this.mapPayment(payment)),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async findOneAdmin(id: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id },
      include: paymentInclude,
    });

    if (!payment) {
      throw new NotFoundException('Pagamento não encontrado');
    }

    return {
      ...this.mapPayment(payment),
      rawResponse: payment.rawResponse,
    };
  }

  private async processProviderPayment(providerPaymentId: string) {
    let mpPayment;

    try {
      mpPayment = await this.mercadoPago.getPayment(providerPaymentId);
    } catch (error) {
      this.logger.error(
        `Erro ao consultar pagamento MP ${providerPaymentId}: ${error}`,
      );
      throw error;
    }

    const payment = await this.prisma.payment.findUnique({
      where: { providerPaymentId },
      include: paymentInclude,
    });

    if (!payment) {
      this.logger.warn(
        `Pagamento local não encontrado para MP id ${providerPaymentId}`,
      );
      return;
    }

    const nextStatus = mapMercadoPagoStatus(mpPayment.status);

    if (nextStatus === payment.status) {
      return;
    }

    const updated = await this.prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: nextStatus,
        rawResponse: mpPayment as Prisma.InputJsonValue,
      },
      include: paymentInclude,
    });

    await this.syncOrderStatus(updated.orderId, nextStatus);
  }

  private async syncOrderStatus(orderId: string, paymentStatus: PaymentStatus) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      return;
    }

    if (order.status === OrderStatus.REFUNDED) {
      return;
    }

    let nextOrderStatus: OrderStatus | null = null;

    if (
      paymentStatus === PaymentStatus.APPROVED &&
      order.status === OrderStatus.WAITING_PAYMENT
    ) {
      if (!this.orderExpiration.isPaymentWindowOpen(order.paymentExpiresAt)) {
        this.logger.warn(
          `Pagamento aprovado após expiração ignorado para pedido ${order.orderNumber}`,
        );
        return;
      }

      nextOrderStatus = OrderStatus.PAID;
    } else if (
      paymentStatus === PaymentStatus.REFUNDED &&
      order.status === OrderStatus.PAID
    ) {
      nextOrderStatus = OrderStatus.REFUNDED;
    }

    if (!nextOrderStatus || !canTransitionStatus(order.status, nextOrderStatus)) {
      return;
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: orderId },
        data: { status: nextOrderStatus! },
      });

      await tx.orderStatusHistory.create({
        data: {
          orderId,
          previousStatus: order.status,
          newStatus: nextOrderStatus!,
          adminId: 'system',
          adminEmail: 'system@mercadopago',
        },
      });
    });

    this.logger.log(
      `Pedido ${order.orderNumber}: ${order.status} → ${nextOrderStatus}`,
    );
  }

  private buildWebhookEventKey(
    body: Record<string, unknown>,
    dataId?: string,
  ) {
    if (body.id) {
      return `mp:event:${body.id}`;
    }

    return `mp:payment:${dataId}:${body.action ?? 'unknown'}`;
  }

  private buildAdminWhere(query: QueryAdminPaymentsDto): Prisma.PaymentWhereInput {
    const where: Prisma.PaymentWhereInput = {};

    if (query.status) {
      where.status = query.status;
    }

    if (query.search?.trim()) {
      const search = query.search.trim();
      where.OR = [
        { providerPaymentId: { contains: search, mode: 'insensitive' } },
        { order: { orderNumber: { contains: search, mode: 'insensitive' } } },
        { order: { customerEmail: { contains: search, mode: 'insensitive' } } },
      ];
    }

    return where;
  }

  private mapPayment(payment: PaymentWithOrder) {
    return {
      id: payment.id,
      orderId: payment.orderId,
      orderNumber: payment.order.orderNumber,
      orderStatus: payment.order.status,
      provider: payment.provider,
      providerPaymentId: payment.providerPaymentId,
      paymentMethod: payment.paymentMethod,
      amount: Number(payment.amount),
      status: payment.status,
      installments: payment.installments,
      pix: payment.pixCopyPaste
        ? {
            qrCode: payment.pixQrCode,
            qrCodeBase64: payment.pixQrCodeBase64,
            copyPaste: payment.pixCopyPaste,
            expiresAt: payment.pixExpiresAt?.toISOString() ?? null,
          }
        : null,
      createdAt: payment.createdAt.toISOString(),
      updatedAt: payment.updatedAt.toISOString(),
    };
  }
}
