import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CalculateShippingDto } from './dto/calculate-shipping.dto';
import { UpdateShippingMethodDto } from './dto/update-shipping-method.dto';
import { CorreiosProvider } from './providers/correios.provider';
import { RetiradaLojaProvider } from './providers/retirada-loja.provider';
import { ShippingProvider } from './providers/shipping-provider.interface';
import {
  SHIPPING_PROVIDERS,
  ShippingCartItem,
  ShippingMethodRecord,
  ShippingQuote,
} from './shipping.types';

@Injectable()
export class ShippingService {
  private readonly logger = new Logger(ShippingService.name);
  private readonly providers: ShippingProvider[];

  constructor(
    private prisma: PrismaService,
    correiosProvider: CorreiosProvider,
    retiradaLojaProvider: RetiradaLojaProvider,
  ) {
    this.providers = [correiosProvider, retiradaLojaProvider];
  }

  async calculate(dto: CalculateShippingDto): Promise<ShippingQuote[]> {
    const zipCode = this.normalizeZipCode(dto.zipCode);

    if (!this.isValidZipCode(zipCode)) {
      throw new BadRequestException('CEP inválido');
    }

    await this.validateCartItems(dto.items);

    const methods = await this.getActiveMethods();
    const quotes = await this.collectQuotes(zipCode, dto.items, methods);

    return quotes.sort((a, b) => {
      const methodA = methods.find((m) => m.id === a.shippingMethodId);
      const methodB = methods.find((m) => m.id === b.shippingMethodId);
      return (methodA?.displayOrder ?? 0) - (methodB?.displayOrder ?? 0);
    });
  }

  async getProviders() {
    const methods = await this.prisma.shippingMethod.findMany({
      orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
    });

    const grouped = new Map<
      string,
      { provider: string; services: ReturnType<typeof this.mapMethod>[] }
    >();

    for (const method of methods) {
      const mapped = this.mapMethod(method);
      const existing = grouped.get(method.provider);

      if (existing) {
        existing.services.push(mapped);
      } else {
        grouped.set(method.provider, {
          provider: method.provider,
          services: [mapped],
        });
      }
    }

    return Array.from(grouped.values());
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
      (quote) => quote.shippingMethodId === shippingMethodId,
    );

    if (!selected) {
      throw new BadRequestException(
        'Opção de frete inválida ou indisponível para este CEP',
      );
    }

    return selected;
  }

  async findAllAdmin() {
    const methods = await this.prisma.shippingMethod.findMany({
      orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
    });

    return methods.map((method) => this.mapMethod(method));
  }

  async updateMethod(id: string, dto: UpdateShippingMethodDto) {
    const existing = await this.prisma.shippingMethod.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundException('Método de entrega não encontrado');
    }

    const updated = await this.prisma.shippingMethod.update({
      where: { id },
      data: {
        isActive: dto.isActive,
        displayOrder: dto.displayOrder,
      },
    });

    return this.mapMethod(updated);
  }

  private async getActiveMethods(): Promise<ShippingMethodRecord[]> {
    const methods = await this.prisma.shippingMethod.findMany({
      where: { isActive: true },
      orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
    });

    return methods.map((method) => ({
      id: method.id,
      name: method.name,
      provider: method.provider,
      serviceCode: method.serviceCode,
      isActive: method.isActive,
      displayOrder: method.displayOrder,
    }));
  }

  private async collectQuotes(
    zipCode: string,
    items: ShippingCartItem[],
    methods: ShippingMethodRecord[],
  ): Promise<ShippingQuote[]> {
    const quotes: ShippingQuote[] = [];

    for (const provider of this.providers) {
      const providerMethods = methods.filter(
        (method) => method.provider === provider.name,
      );

      if (providerMethods.length === 0) {
        continue;
      }

      try {
        const providerQuotes = await provider.calculate(
          zipCode,
          items,
          providerMethods,
        );
        quotes.push(...providerQuotes);
      } catch (error) {
        this.logger.error(
          `Falha ao calcular frete com ${provider.name}`,
          error instanceof Error ? error.stack : undefined,
        );
      }
    }

    if (quotes.length === 0) {
      throw new BadRequestException(
        'Nenhuma opção de frete disponível para este CEP',
      );
    }

    return quotes;
  }

  private async validateCartItems(
    items: Array<{ productVariantId: string; quantity: number }>,
  ) {
    const variantIds = items.map((item) => item.productVariantId);
    const variants = await this.prisma.productVariant.findMany({
      where: { id: { in: variantIds }, isActive: true, product: { isActive: true } },
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

  private mapMethod(method: {
    id: string;
    name: string;
    provider: string;
    serviceCode: string;
    isActive: boolean;
    displayOrder: number;
    createdAt?: Date;
    updatedAt?: Date;
  }) {
    return {
      id: method.id,
      name: method.name,
      provider: method.provider,
      serviceCode: method.serviceCode,
      isActive: method.isActive,
      displayOrder: method.displayOrder,
      createdAt: method.createdAt?.toISOString(),
      updatedAt: method.updatedAt?.toISOString(),
    };
  }

  getProviderNames() {
    return Object.values(SHIPPING_PROVIDERS);
  }
}
