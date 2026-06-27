import { Body, Controller, Headers, Post } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { CheckoutService } from './checkout.service';
import { CheckoutDto } from './dto/checkout.dto';

const CART_TOKEN_HEADER = 'x-cart-token';

@Controller('checkout')
export class CheckoutController {
  constructor(
    private checkoutService: CheckoutService,
    private authService: AuthService,
  ) {}

  @Post()
  async checkout(
    @Headers(CART_TOKEN_HEADER) cartToken: string | undefined,
    @Headers('authorization') authorization: string | undefined,
    @Body() dto: CheckoutDto,
  ) {
    const customerId =
      await this.authService.resolveCustomerIdFromAuthorization(authorization);

    return this.checkoutService.checkout(cartToken, dto, customerId);
  }
}
