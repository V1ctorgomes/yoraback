import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CheckoutController } from './checkout.controller';
import { CheckoutService } from './checkout.service';
import { OrdersController } from './orders.controller';

@Module({
  imports: [AuthModule],
  controllers: [CheckoutController, OrdersController],
  providers: [CheckoutService],
})
export class CheckoutModule {}
