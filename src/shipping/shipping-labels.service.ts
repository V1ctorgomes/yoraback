import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { LogisticStatus, OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MelhorEnvioApiClient } from './melhor-envio/melhor-envio-api.client';
import { MelhorEnvioConfigService } from './melhor-envio/melhor-envio-config.service';
import { MelhorEnvioAddressPayload } from './melhor-envio/melhor-envio.types';
import type { MelhorEnvioQuoteService } from './melhor-envio/melhor-envio.types';
import { ShippingPackageSelectorService } from './shipping-package-selector.service';
import { ShippingSendersService } from './shipping-senders.service';
import { SHIPPING_PROVIDERS } from './shipping.types';
import { CreateShippingLabelDto } from './dto/create-shipping-label.dto';

const PAID_STATUSES: OrderStatus[] = [
  OrderStatus.PAID,
  OrderStatus.PROCESSING,
  OrderStatus.SHIPPED,
  OrderStatus.DELIVERED,
];

@Injectable()
export class ShippingLabelsService {
  private readonly logger = new Logger(ShippingLabelsService.name);

  constructor(
    private prisma: PrismaService,
    private configService: MelhorEnvioConfigService,
    private apiClient: MelhorEnvioApiClient,
    private sendersService: ShippingSendersService,
    private packageSelector: ShippingPackageSelectorService,
  ) {}

  async purchaseLabel(dto: CreateShippingLabelDto) {
    try {
      return await this.purchaseLabelInternal(dto);
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }

      const message =
        error instanceof Error
          ? error.message
          : 'Falha ao gerar etiqueta no Melhor Envio';

      this.logger.error(
        `Erro ao comprar etiqueta do pedido ${dto.orderId}`,
        error instanceof Error ? error.stack : undefined,
      );

      throw new BadRequestException(
        message.includes('Melhor Envio')
          ? message
          : `Não foi possível gerar a etiqueta: ${message}`,
      );
    }
  }

  private async purchaseLabelInternal(dto: CreateShippingLabelDto) {
    const order = await this.getOrderForLabel(dto.orderId);

    if (!PAID_STATUSES.includes(order.status)) {
      throw new BadRequestException(
        'Apenas pedidos pagos podem gerar etiquetas',
      );
    }

    if (order.shippingLabelId) {
      throw new BadRequestException('Este pedido já possui uma etiqueta ativa');
    }

    if (order.shippingProvider === 'RetiradaLoja') {
      throw new BadRequestException(
        'Pedidos de retirada na loja não geram etiqueta',
      );
    }

    const isReady = await this.configService.isReady();
    if (!isReady) {
      throw new BadRequestException('Melhor Envio não está configurado');
    }

    const accessToken = await this.configService.getAccessToken();
    const environment = await this.configService.getEnvironment();

    if (!accessToken) {
      throw new BadRequestException('Token do Melhor Envio indisponível');
    }

    const sender = await this.sendersService.getDefaultSender();
    if (!sender) {
      throw new BadRequestException('Cadastre um remetente antes de gerar etiquetas');
    }

    if (!order.address) {
      throw new BadRequestException('Pedido sem endereço de entrega');
    }

    const packageInfo = await this.packageSelector.selectForItems(
      order.items.map((item) => ({
        quantity: item.quantity,
      })),
    );

    const quoteProducts = order.items.map((item) => ({
      id: item.productVariantId,
      width: packageInfo.widthCm,
      height: packageInfo.heightCm,
      length: packageInfo.lengthCm,
      weight: this.clampWeight(packageInfo.totalWeightKg / order.items.length),
      insurance_value: Number(item.unitPrice),
      quantity: item.quantity,
    }));

    const cartProducts = order.items.map((item) => ({
      name: item.productName,
      quantity: item.quantity,
      unitary_value: Number(item.unitPrice),
    }));

    const insuranceValue = order.items.reduce(
      (total, item) => total + Number(item.unitPrice) * item.quantity,
      0,
    );

    const serviceId = await this.resolveServiceId(
      order,
      dto,
      quoteProducts,
      sender,
      accessToken,
      environment,
    );

    const cart = await this.apiClient.addToCart(environment, accessToken, {
      service: serviceId,
      from: this.mapSender(sender),
      to: this.mapRecipient(order),
      products: cartProducts,
      volumes: [
        {
          height: packageInfo.heightCm,
          width: packageInfo.widthCm,
          length: packageInfo.lengthCm,
          weight: this.clampWeight(packageInfo.totalWeightKg),
        },
      ],
      options: {
        insurance_value: insuranceValue,
        receipt: false,
        own_hand: false,
        reverse: false,
        non_commercial: true,
        invoice: { key: '' },
      },
    });

    await this.apiClient.checkout(environment, accessToken, [cart.id]);
    await this.apiClient.generateLabels(environment, accessToken, [cart.id]);

    const print = await this.apiClient.printLabels(environment, accessToken, [
      cart.id,
    ]);
    const labelUrl = print.url ?? print.link;

    if (!labelUrl) {
      throw new BadRequestException(
        'Etiqueta gerada, mas o Melhor Envio não retornou a URL de impressão.',
      );
    }

    const updated = await this.prisma.order.update({
      where: { id: order.id },
      data: {
        shippingLabelId: cart.id,
        shippingLabelUrl: labelUrl,
        trackingCode: cart.tracking ?? cart.self_tracking ?? order.trackingCode,
        logisticStatus: LogisticStatus.LABEL_CREATED,
        status:
          order.status === OrderStatus.PAID ? OrderStatus.PROCESSING : order.status,
      },
    });

    await this.prisma.shippingEvent.create({
      data: {
        orderId: order.id,
        provider: SHIPPING_PROVIDERS.MELHOR_ENVIO,
        status: LogisticStatus.LABEL_CREATED,
        description: 'Etiqueta gerada com sucesso',
        eventDate: new Date(),
      },
    });

    return this.mapLabel(updated);
  }

  async getLabel(orderId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) {
      throw new NotFoundException('Pedido não encontrado');
    }

    return this.mapLabel(order);
  }

  async cancelLabel(orderId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });

    if (!order?.shippingLabelId) {
      throw new NotFoundException('Etiqueta não encontrada para este pedido');
    }

    const accessToken = await this.configService.getAccessToken();
    const environment = await this.configService.getEnvironment();

    if (!accessToken) {
      throw new BadRequestException('Token do Melhor Envio indisponível');
    }

    await this.apiClient.cancelLabel(
      environment,
      accessToken,
      order.shippingLabelId,
    );

    const updated = await this.prisma.order.update({
      where: { id: orderId },
      data: {
        shippingLabelId: null,
        shippingLabelUrl: null,
        logisticStatus: LogisticStatus.CANCELLED,
      },
    });

    await this.prisma.shippingEvent.create({
      data: {
        orderId,
        provider: SHIPPING_PROVIDERS.MELHOR_ENVIO,
        status: LogisticStatus.CANCELLED,
        description: 'Etiqueta cancelada',
        eventDate: new Date(),
      },
    });

    return this.mapLabel(updated);
  }

  async printLabel(orderId: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });

    if (!order?.shippingLabelId) {
      throw new NotFoundException('Etiqueta não encontrada para este pedido');
    }

    if (order.shippingLabelUrl) {
      return { url: order.shippingLabelUrl };
    }

    const accessToken = await this.configService.getAccessToken();
    const environment = await this.configService.getEnvironment();

    if (!accessToken) {
      throw new BadRequestException('Token do Melhor Envio indisponível');
    }

    const print = await this.apiClient.printLabels(environment, accessToken, [
      order.shippingLabelId,
    ]);

    const labelUrl = print.url ?? print.link;
    if (!labelUrl) {
      throw new BadRequestException(
        'O Melhor Envio não retornou a URL de impressão.',
      );
    }

    await this.prisma.order.update({
      where: { id: orderId },
      data: { shippingLabelUrl: labelUrl },
    });

    return { url: labelUrl };
  }

  async printBatch(orderIds: string[]) {
    const orders = await this.prisma.order.findMany({
      where: {
        id: { in: orderIds },
        shippingLabelId: { not: null },
      },
    });

    if (orders.length === 0) {
      throw new BadRequestException('Nenhuma etiqueta encontrada para impressão');
    }

    const accessToken = await this.configService.getAccessToken();
    const environment = await this.configService.getEnvironment();

    if (!accessToken) {
      throw new BadRequestException('Token do Melhor Envio indisponível');
    }

    const labelIds = orders
      .map((order) => order.shippingLabelId)
      .filter((id): id is string => Boolean(id));

    const print = await this.apiClient.printLabels(
      environment,
      accessToken,
      labelIds,
    );

    await this.prisma.order.updateMany({
      where: { id: { in: orders.map((order) => order.id) } },
      data: { shippingLabelUrl: print.url ?? print.link },
    });

    const labelUrl = print.url ?? print.link;
    if (!labelUrl) {
      throw new BadRequestException(
        'O Melhor Envio não retornou a URL de impressão em lote.',
      );
    }

    return { url: labelUrl };
  }

  private async resolveServiceId(
    order: Prisma.OrderGetPayload<{
      include: {
        address: true;
        shippingMethodRef: true;
        shippingServiceRef: true;
      };
    }>,
    dto: CreateShippingLabelDto,
    quoteProducts: Array<{
      id: string;
      width: number;
      height: number;
      length: number;
      weight: number;
      insurance_value: number;
      quantity: number;
    }>,
    sender: { zipCode: string },
    accessToken: string,
    environment: Awaited<ReturnType<MelhorEnvioConfigService['getEnvironment']>>,
  ): Promise<number> {
    if (dto.serviceId && dto.serviceId > 0) {
      return dto.serviceId;
    }

    const serviceCode =
      order.shippingServiceRef?.externalId ??
      order.shippingMethodRef?.serviceCode;
    if (
      (order.shippingServiceRef ||
        order.shippingMethodRef?.provider === SHIPPING_PROVIDERS.MELHOR_ENVIO) &&
      serviceCode &&
      /^\d+$/.test(serviceCode)
    ) {
      return Number(serviceCode);
    }

    if (!order.address) {
      throw new BadRequestException('Pedido sem endereço de entrega');
    }

    const services = this.normalizeQuoteServices(
      await this.apiClient.calculateQuote(environment, accessToken, {
        from: { postal_code: sender.zipCode.replace(/\D/g, '') },
        to: { postal_code: order.address.zipCode.replace(/\D/g, '') },
        products: quoteProducts,
      }),
    );

    const matched = this.matchQuoteService(services, order);

    if (!matched) {
      throw new BadRequestException(
        'Não foi possível encontrar um serviço equivalente no Melhor Envio para este pedido. Verifique se o Melhor Envio está conectado e se o CEP é atendido.',
      );
    }

    return matched;
  }

  private matchQuoteService(
    services: MelhorEnvioQuoteService[],
    order: {
      shippingMethod: string;
      shippingProvider: string | null;
      shippingService: string | null;
      shippingMethodRef: { name: string; serviceCode: string } | null;
    },
  ): number | null {
    if (services.length === 0) {
      return null;
    }

    const hint = [
      order.shippingService,
      order.shippingMethod,
      order.shippingProvider,
      order.shippingMethodRef?.name,
      order.shippingMethodRef?.serviceCode,
    ]
      .filter(Boolean)
      .join(' ')
      .toUpperCase();

    const rules: Array<{ keyword: string; company?: string }> = [
      { keyword: 'SEDEX', company: 'CORREIOS' },
      { keyword: 'PAC', company: 'CORREIOS' },
      { keyword: 'JADLOG' },
      { keyword: 'AZUL' },
      { keyword: 'LATAM' },
    ];

    for (const rule of rules) {
      if (!hint.includes(rule.keyword)) {
        continue;
      }

      const match = services.find((service) => {
        const serviceName = service.name.toUpperCase();
        const companyName = service.company.name.toUpperCase();

        if (!serviceName.includes(rule.keyword)) {
          return false;
        }

        if (rule.company && !companyName.includes(rule.company)) {
          return false;
        }

        return true;
      });

      if (match) {
        return match.id;
      }
    }

    const looseMatch = services.find((service) => {
      const label = `${service.company.name} ${service.name}`.toUpperCase();
      return hint
        .split(/\s+/)
        .filter((token) => token.length >= 3)
        .some((token) => label.includes(token));
    });

    return looseMatch?.id ?? services[0]?.id ?? null;
  }

  private async getOrderForLabel(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: true,
        address: true,
        shippingMethodRef: true,
        shippingServiceRef: true,
      },
    });

    if (!order) {
      throw new NotFoundException('Pedido não encontrado');
    }

    return order;
  }

  private normalizeQuoteServices(
    payload: MelhorEnvioQuoteService[] | Record<string, MelhorEnvioQuoteService[]>,
  ): MelhorEnvioQuoteService[] {
    if (Array.isArray(payload)) {
      return payload;
    }

    return Object.values(payload).flat();
  }

  private clampWeight(weight: number) {
    return Math.max(0.01, Number(weight.toFixed(3)));
  }

  private normalizeStateAbbr(state: string) {
    const normalized = state.trim().toUpperCase();
    return normalized.length === 2 ? normalized : normalized.slice(0, 2);
  }

  private mapSender(sender: {
    name: string;
    company: string | null;
    document: string;
    phone: string;
    zipCode: string;
    address: string;
    number: string;
    complement: string | null;
    district: string;
    city: string;
    state: string;
  }): MelhorEnvioAddressPayload {
    const companyDocument = this.normalizeCnpj(sender.company);

    return {
      name: sender.name,
      phone: sender.phone,
      email: 'contato@yora.com.br',
      document: sender.document,
      company_document: companyDocument,
      address: sender.address,
      complement: sender.complement ?? undefined,
      number: sender.number,
      district: sender.district,
      city: sender.city,
      state_abbr: this.normalizeStateAbbr(sender.state),
      country_id: 'BR',
      postal_code: sender.zipCode.replace(/\D/g, ''),
    };
  }

  private mapRecipient(
    order: Prisma.OrderGetPayload<{ include: { address: true } }>,
  ): MelhorEnvioAddressPayload {
    if (!order.address) {
      throw new BadRequestException('Pedido sem endereço');
    }

    if (!order.customerCpf) {
      throw new BadRequestException(
        'Pedido sem CPF do cliente. Finalize um novo pedido com CPF informado.',
      );
    }

    return {
      name: order.address.recipient,
      phone: order.customerPhone.replace(/\D/g, ''),
      email: order.customerEmail,
      document: order.customerCpf,
      address: order.address.street,
      complement: order.address.complement ?? undefined,
      number: order.address.number,
      district: order.address.district,
      city: order.address.city,
      state_abbr: this.normalizeStateAbbr(order.address.state),
      country_id: 'BR',
      postal_code: order.address.zipCode.replace(/\D/g, ''),
      note: order.address.reference
        ? `Pedido ${order.orderNumber} — ${order.address.reference}`
        : `Pedido ${order.orderNumber}`,
    };
  }

  private normalizeCnpj(value: string | null) {
    if (!value) {
      return undefined;
    }

    const digits = value.replace(/\D/g, '');
    return digits.length === 14 ? digits : undefined;
  }

  private mapLabel(order: {
    id: string;
    shippingLabelId: string | null;
    shippingLabelUrl: string | null;
    trackingCode: string | null;
    logisticStatus: LogisticStatus | null;
  }) {
    return {
      orderId: order.id,
      labelId: order.shippingLabelId,
      labelUrl: order.shippingLabelUrl,
      trackingCode: order.trackingCode,
      logisticStatus: order.logisticStatus,
    };
  }
}
