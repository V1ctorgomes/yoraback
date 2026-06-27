import { Module } from '@nestjs/common';
import { CheckoutController } from './checkout.controller';
import { CheckoutService } from './checkout.service';
import { OrdersController } from './orders.controller';

@Module({
  controllers: [CheckoutController, OrdersController],
  providers: [CheckoutService],
})
export class CheckoutModule {}
