import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CustomersCoreModule } from '../customer/customers-core.module';
import { OrdersCoreModule } from '../orders/orders-core.module';
import { ShippingModule } from '../shipping/shipping.module';
import { PromotionsModule } from '../promotions/promotions.module';
import { CheckoutController } from './checkout.controller';
import { CheckoutService } from './checkout.service';
import { OrdersController } from './orders.controller';

@Module({
  imports: [AuthModule, CustomersCoreModule, OrdersCoreModule, ShippingModule, PromotionsModule],
  controllers: [CheckoutController, OrdersController],
  providers: [CheckoutService],
})
export class CheckoutModule {}
