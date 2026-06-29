import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { LogisticStatus, OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MelhorEnvioApiClient } from './melhor-envio/melhor-envio-api.client';
import { MelhorEnvioConfigService } from './melhor-envio/melhor-envio-config.service';
import { MelhorEnvioAddressPayload } from './melhor-envio/melhor-envio.types';
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
  constructor(
    private prisma: PrismaService,
    private configService: MelhorEnvioConfigService,
    private apiClient: MelhorEnvioApiClient,
    private sendersService: ShippingSendersService,
    private packageSelector: ShippingPackageSelectorService,
  ) {}

  async purchaseLabel(dto: CreateShippingLabelDto) {
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

    const serviceId = Number(order.shippingMethodRef?.serviceCode ?? dto.serviceId);
    if (!serviceId) {
      throw new BadRequestException('Serviço de frete inválido para etiqueta');
    }

    const products = order.items.map((item) => ({
      id: item.productVariantId,
      width: packageInfo.widthCm,
      height: packageInfo.heightCm,
      length: packageInfo.lengthCm,
      weight: packageInfo.totalWeightKg / order.items.length,
      insurance_value: Number(item.unitPrice),
      quantity: item.quantity,
    }));

    const cart = await this.apiClient.addToCart(environment, accessToken, {
      service: serviceId,
      from: this.mapSender(sender),
      to: this.mapRecipient(order),
      products,
      volumes: [
        {
          height: packageInfo.heightCm,
          width: packageInfo.widthCm,
          length: packageInfo.lengthCm,
          weight: packageInfo.totalWeightKg,
        },
      ],
      options: {
        non_commercial: true,
      },
    });

    await this.apiClient.checkout(environment, accessToken, [cart.id]);
    await this.apiClient.generateLabels(environment, accessToken, [cart.id]);

    const print = await this.apiClient.printLabels(environment, accessToken, [
      cart.id,
    ]);

    const updated = await this.prisma.order.update({
      where: { id: order.id },
      data: {
        shippingLabelId: cart.id,
        shippingLabelUrl: print.url,
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

    await this.prisma.order.update({
      where: { id: orderId },
      data: { shippingLabelUrl: print.url },
    });

    return print;
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
      data: { shippingLabelUrl: print.url },
    });

    return print;
  }

  private async getOrderForLabel(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: true,
        address: true,
        shippingMethodRef: true,
      },
    });

    if (!order) {
      throw new NotFoundException('Pedido não encontrado');
    }

    return order;
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
    return {
      name: sender.name,
      phone: sender.phone,
      email: 'contato@yora.com.br',
      document: sender.document,
      company_document: sender.company ?? undefined,
      address: sender.address,
      complement: sender.complement ?? undefined,
      number: sender.number,
      district: sender.district,
      city: sender.city,
      postal_code: sender.zipCode,
    };
  }

  private mapRecipient(
    order: Prisma.OrderGetPayload<{ include: { address: true } }>,
  ): MelhorEnvioAddressPayload {
    if (!order.address) {
      throw new BadRequestException('Pedido sem endereço');
    }

    return {
      name: order.address.recipient,
      phone: order.customerPhone.replace(/\D/g, ''),
      email: order.customerEmail,
      document: '00000000000',
      address: order.address.street,
      complement: order.address.complement ?? undefined,
      number: order.address.number,
      district: order.address.district,
      city: order.address.city,
      postal_code: order.address.zipCode.replace(/\D/g, ''),
    };
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
