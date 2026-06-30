import {
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CalculateShippingDto } from './dto/calculate-shipping.dto';
import { MelhorEnvioProvider } from './providers/melhor-envio.provider';
import {
  ActiveShippingServiceRecord,
  ShippingCartItem,
  ShippingQuote,
} from './shipping.types';

@Injectable()
export class ShippingService {
  constructor(
    private prisma: PrismaService,
    private melhorEnvioProvider: MelhorEnvioProvider,
  ) {}

  async calculate(dto: CalculateShippingDto): Promise<ShippingQuote[]> {
    const zipCode = this.normalizeZipCode(dto.zipCode);

    if (!this.isValidZipCode(zipCode)) {
      throw new BadRequestException('CEP inválido');
    }

    await this.validateCartItems(dto.items);

    const services = await this.getActiveServices();
    if (services.length === 0) {
      throw new BadRequestException(
        'Nenhum serviço de entrega ativo. Sincronize e ative transportadoras no painel administrativo.',
      );
    }

    const quotes = await this.melhorEnvioProvider.calculate(
      zipCode,
      dto.items,
      services,
    );

    if (quotes.length === 0) {
      throw new BadRequestException(
        'Nenhuma opção de frete disponível para este CEP',
      );
    }

    return quotes.sort((a, b) => this.compareQuotes(a, b, services));
  }

  async validateSelectedQuote(
    shippingMethodId: string,
    zipCode: string,
    items: ShippingCartItem[],
  ): Promise<ShippingQuote> {
    const quotes = await this.calculate({
      zipCode,
      items: items.map((item) => ({
        productVariantId: item.productVariantId,
        quantity: item.quantity,
      })),
    });

    const selected = quotes.find(
      (quote) =>
        quote.shippingMethodId === shippingMethodId ||
        quote.shippingServiceId === shippingMethodId,
    );

    if (!selected) {
      throw new BadRequestException(
        'Opção de frete inválida ou indisponível para este CEP',
      );
    }

    return selected;
  }

  private async getActiveServices(): Promise<ActiveShippingServiceRecord[]> {
    const services = await this.prisma.shippingService.findMany({
      where: {
        isActive: true,
        carrier: { isActive: true },
      },
      include: { carrier: true },
      orderBy: [
        { carrier: { displayOrder: 'asc' } },
        { displayOrder: 'asc' },
        { name: 'asc' },
      ],
    });

    return services.map((service) => ({
      id: service.id,
      externalId: service.externalId,
      name: service.name,
      displayOrder: service.displayOrder,
      customMessage: service.customMessage,
      carrier: {
        id: service.carrier.id,
        name: service.carrier.name,
        isActive: service.carrier.isActive,
        displayOrder: service.carrier.displayOrder,
        customMessage: service.carrier.customMessage,
      },
    }));
  }

  private compareQuotes(
    a: ShippingQuote,
    b: ShippingQuote,
    services: ActiveShippingServiceRecord[],
  ) {
    const serviceA = services.find((entry) => entry.id === a.shippingServiceId);
    const serviceB = services.find((entry) => entry.id === b.shippingServiceId);

    const carrierOrder =
      (serviceA?.carrier.displayOrder ?? 0) -
      (serviceB?.carrier.displayOrder ?? 0);
    if (carrierOrder !== 0) {
      return carrierOrder;
    }

    const serviceOrder =
      (serviceA?.displayOrder ?? 0) - (serviceB?.displayOrder ?? 0);
    if (serviceOrder !== 0) {
      return serviceOrder;
    }

    const carrierName = serviceA?.carrier.name.localeCompare(
      serviceB?.carrier.name ?? '',
    );
    if (carrierName !== 0) {
      return carrierName ?? 0;
    }

    return a.service.localeCompare(b.service);
  }

  private async validateCartItems(
    items: Array<{ productVariantId: string; quantity: number }>,
  ) {
    const variantIds = items.map((item) => item.productVariantId);
    const variants = await this.prisma.productVariant.findMany({
      where: {
        id: { in: variantIds },
        isActive: true,
        product: { isActive: true },
      },
      select: { id: true },
    });

    if (variants.length !== variantIds.length) {
      throw new BadRequestException('Itens do carrinho inválidos');
    }
  }

  private normalizeZipCode(zipCode: string): string {
    return zipCode.replace(/\D/g, '');
  }

  private isValidZipCode(zipCode: string): boolean {
    return /^\d{8}$/.test(zipCode);
  }
}
