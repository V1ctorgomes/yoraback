import { Body, Controller, Headers, Post } from '@nestjs/common';
import { CheckoutService } from './checkout.service';
import { CheckoutDto } from './dto/checkout.dto';

const CART_TOKEN_HEADER = 'x-cart-token';

@Controller('checkout')
export class CheckoutController {
  constructor(private checkoutService: CheckoutService) {}

  @Post()
  checkout(
    @Headers(CART_TOKEN_HEADER) cartToken: string | undefined,
    @Body() dto: CheckoutDto,
  ) {
    return this.checkoutService.checkout(cartToken, dto);
  }
}
