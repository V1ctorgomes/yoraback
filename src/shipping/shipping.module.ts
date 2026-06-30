import { Module } from '@nestjs/common';
import { AdminExpeditionController } from './admin-expedition.controller';
import { AdminMelhorEnvioController } from './admin-melhor-envio.controller';
import { AdminShippingController } from './admin-shipping.controller';
import { AdminShippingPackagesController } from './admin-shipping-packages.controller';
import { AdminShippingSendersController } from './admin-shipping-senders.controller';
import { EncryptionService } from './encryption.service';
import { ExpeditionService } from './expedition.service';
import { MelhorEnvioApiClient } from './melhor-envio/melhor-envio-api.client';
import { MelhorEnvioConfigService } from './melhor-envio/melhor-envio-config.service';
import { MelhorEnvioOAuthController } from './melhor-envio-oauth.controller';
import { MelhorEnvioWebhookController } from './melhor-envio-webhook.controller';
import { MelhorEnvioWebhookService } from './melhor-envio-webhook.service';
import { MelhorEnvioProvider } from './providers/melhor-envio.provider';
import { ShippingController } from './shipping.controller';
import { ShippingLabelsController } from './shipping-labels.controller';
import { ShippingLabelsService } from './shipping-labels.service';
import { ShippingPackageSelectorService } from './shipping-package-selector.service';
import { ShippingPackagesService } from './shipping-packages.service';
import { ShippingSendersService } from './shipping-senders.service';
import { ShippingService } from './shipping.service';
import { ShippingSyncService } from './shipping-sync.service';
import { ShippingTrackingController } from './shipping-tracking.controller';
import { ShippingTrackingService } from './shipping-tracking.service';

@Module({
  controllers: [
    ShippingController,
    AdminShippingController,
    AdminMelhorEnvioController,
    AdminShippingSendersController,
    AdminShippingPackagesController,
    AdminExpeditionController,
    ShippingLabelsController,
    ShippingTrackingController,
    MelhorEnvioOAuthController,
    MelhorEnvioWebhookController,
  ],
  providers: [
    ShippingService,
    ShippingSyncService,
    MelhorEnvioProvider,
    EncryptionService,
    MelhorEnvioApiClient,
    MelhorEnvioConfigService,
    ShippingPackageSelectorService,
    ShippingSendersService,
    ShippingPackagesService,
    ShippingLabelsService,
    ShippingTrackingService,
    ExpeditionService,
    MelhorEnvioWebhookService,
  ],
  exports: [ShippingService, ShippingTrackingService],
})
export class ShippingModule {}
