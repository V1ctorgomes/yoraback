import { Module } from '@nestjs/common';
import { AdminShippingMethodsController } from './admin-shipping-methods.controller';
import { CorreiosProvider } from './providers/correios.provider';
import { RetiradaLojaProvider } from './providers/retirada-loja.provider';
import { ShippingController } from './shipping.controller';
import { ShippingService } from './shipping.service';

@Module({
  controllers: [ShippingController, AdminShippingMethodsController],
  providers: [ShippingService, CorreiosProvider, RetiradaLojaProvider],
  exports: [ShippingService],
})
export class ShippingModule {}
