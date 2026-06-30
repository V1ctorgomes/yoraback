import {
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MelhorEnvioApiClient } from './melhor-envio/melhor-envio-api.client';
import { MelhorEnvioConfigService } from './melhor-envio/melhor-envio-config.service';
import { SHIPPING_PROVIDERS } from './shipping.types';

@Injectable()
export class ShippingSyncService {
  private readonly logger = new Logger(ShippingSyncService.name);

  constructor(
    private prisma: PrismaService,
    private configService: MelhorEnvioConfigService,
    private apiClient: MelhorEnvioApiClient,
  ) {}

  async syncFromMelhorEnvio() {
    const isReady = await this.configService.isReady();
    if (!isReady) {
      throw new BadRequestException(
        'Conecte a conta do Melhor Envio antes de sincronizar',
      );
    }

    const accessToken = await this.configService.getAccessToken();
    const environment = await this.configService.getEnvironment();

    if (!accessToken) {
      throw new BadRequestException('Token do Melhor Envio indisponível');
    }

    const remoteServices = await this.apiClient.listShipmentServices(
      environment,
      accessToken,
    );

    const carriersByExternalId = new Map<
      string,
      {
        externalId: string;
        name: string;
        logoUrl: string | null;
        services: Array<{
          externalId: string;
          name: string;
        }>;
      }
    >();

    for (const service of remoteServices) {
      const carrierKey = String(service.company.id);
      const existing = carriersByExternalId.get(carrierKey);

      if (existing) {
        existing.services.push({
          externalId: String(service.id),
          name: service.name,
        });
      } else {
        carriersByExternalId.set(carrierKey, {
          externalId: carrierKey,
          name: service.company.name,
          logoUrl: service.company.picture ?? null,
          services: [
            {
              externalId: String(service.id),
              name: service.name,
            },
          ],
        });
      }
    }

    const syncedAt = new Date();

    await this.prisma.$transaction(async (tx) => {
      for (const carrier of carriersByExternalId.values()) {
        const existingCarrier = await tx.shippingCarrier.findUnique({
          where: {
            provider_externalId: {
              provider: SHIPPING_PROVIDERS.MELHOR_ENVIO,
              externalId: carrier.externalId,
            },
          },
        });

        const carrierRecord = existingCarrier
          ? await tx.shippingCarrier.update({
              where: { id: existingCarrier.id },
              data: {
                name: carrier.name,
                logoUrl: carrier.logoUrl,
              },
            })
          : await tx.shippingCarrier.create({
              data: {
                provider: SHIPPING_PROVIDERS.MELHOR_ENVIO,
                externalId: carrier.externalId,
                name: carrier.name,
                logoUrl: carrier.logoUrl,
                displayOrder:
                  ((await tx.shippingCarrier.aggregate({ _max: { displayOrder: true } }))
                    ._max.displayOrder ?? 0) + 1,
              },
            });

        for (const service of carrier.services) {
          const existingService = await tx.shippingService.findUnique({
            where: {
              carrierId_externalId: {
                carrierId: carrierRecord.id,
                externalId: service.externalId,
              },
            },
          });

          if (existingService) {
            await tx.shippingService.update({
              where: { id: existingService.id },
              data: { name: service.name },
            });
          } else {
            const maxOrder = await tx.shippingService.aggregate({
              where: { carrierId: carrierRecord.id },
              _max: { displayOrder: true },
            });

            await tx.shippingService.create({
              data: {
                carrierId: carrierRecord.id,
                externalId: service.externalId,
                name: service.name,
                displayOrder: (maxOrder._max.displayOrder ?? 0) + 1,
              },
            });
          }
        }
      }

      await tx.melhorEnvioConfig.update({
        where: { id: 'default' },
        data: { lastSyncedAt: syncedAt },
      });
    });

    this.logger.log(
      `Sincronização concluída: ${carriersByExternalId.size} transportadoras`,
    );

    return this.getAdminProviders();
  }

  async getAdminProviders() {
    const [config, carriers] = await Promise.all([
      this.configService.getAdminConfig(),
      this.prisma.shippingCarrier.findMany({
        include: {
          services: {
            orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
          },
        },
        orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
      }),
    ]);

    return {
      melhorEnvio: config,
      lastSyncedAt: await this.getLastSyncedAt(),
      carriers: carriers.map((carrier) => this.mapCarrier(carrier)),
    };
  }

  async updateCarrier(id: string, data: {
    isActive?: boolean;
    displayOrder?: number;
    customMessage?: string | null;
  }) {
    const existing = await this.prisma.shippingCarrier.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new BadRequestException('Transportadora não encontrada');
    }

    const updated = await this.prisma.shippingCarrier.update({
      where: { id },
      data: {
        isActive: data.isActive,
        displayOrder: data.displayOrder,
        customMessage: data.customMessage,
      },
      include: {
        services: {
          orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }],
        },
      },
    });

    return this.mapCarrier(updated);
  }

  async updateService(id: string, data: {
    isActive?: boolean;
    displayOrder?: number;
    customMessage?: string | null;
  }) {
    const existing = await this.prisma.shippingService.findUnique({
      where: { id },
      include: { carrier: true },
    });

    if (!existing) {
      throw new BadRequestException('Serviço não encontrado');
    }

    const updated = await this.prisma.shippingService.update({
      where: { id },
      data: {
        isActive: data.isActive,
        displayOrder: data.displayOrder,
        customMessage: data.customMessage,
      },
      include: { carrier: true },
    });

    return this.mapService(updated, updated.carrier);
  }

  private async getLastSyncedAt() {
    const config = await this.prisma.melhorEnvioConfig.findUnique({
      where: { id: 'default' },
      select: { lastSyncedAt: true },
    });

    return config?.lastSyncedAt?.toISOString() ?? null;
  }

  private mapCarrier(carrier: {
    id: string;
    provider: string;
    externalId: string;
    name: string;
    logoUrl: string | null;
    isActive: boolean;
    displayOrder: number;
    customMessage: string | null;
    services: Array<{
      id: string;
      carrierId: string;
      externalId: string;
      name: string;
      description: string | null;
      isActive: boolean;
      displayOrder: number;
      customMessage: string | null;
      carrier?: {
        id: string;
        name: string;
        provider: string;
        externalId: string;
        logoUrl: string | null;
        isActive: boolean;
        displayOrder: number;
        customMessage: string | null;
      };
    }>;
  }) {
    return {
      id: carrier.id,
      provider: carrier.provider,
      externalId: carrier.externalId,
      name: carrier.name,
      logoUrl: carrier.logoUrl,
      isActive: carrier.isActive,
      displayOrder: carrier.displayOrder,
      customMessage: carrier.customMessage,
      services: carrier.services.map((service) =>
        this.mapService(service, carrier),
      ),
    };
  }

  private mapService(
    service: {
      id: string;
      carrierId: string;
      externalId: string;
      name: string;
      description: string | null;
      isActive: boolean;
      displayOrder: number;
      customMessage: string | null;
    },
    carrier: {
      id: string;
      name: string;
      provider: string;
      externalId: string;
      logoUrl: string | null;
      isActive: boolean;
      displayOrder: number;
      customMessage: string | null;
    },
  ) {
    return {
      id: service.id,
      carrierId: service.carrierId,
      externalId: service.externalId,
      name: service.name,
      description: service.description,
      isActive: service.isActive,
      displayOrder: service.displayOrder,
      customMessage: service.customMessage,
      carrier: {
        id: carrier.id,
        name: carrier.name,
        provider: carrier.provider,
        externalId: carrier.externalId,
        logoUrl: carrier.logoUrl,
        isActive: carrier.isActive,
        displayOrder: carrier.displayOrder,
        customMessage: carrier.customMessage,
      },
    };
  }
}
