import { Controller, Get, Param } from '@nestjs/common';
import { CheckoutService } from './checkout.service';

@Controller('orders')
export class OrdersController {
  constructor(private checkoutService: CheckoutService) {}

  @Get(':orderNumber')
  getOrder(@Param('orderNumber') orderNumber: string) {
    return this.checkoutService.getOrderByNumber(orderNumber);
  }
}
