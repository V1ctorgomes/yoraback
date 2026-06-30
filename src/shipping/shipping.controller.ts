import { Body, Controller, Post } from '@nestjs/common';
import { CalculateShippingDto } from './dto/calculate-shipping.dto';
import { ShippingService } from './shipping.service';

@Controller('shipping')
export class ShippingController {
  constructor(private shippingService: ShippingService) {}

  @Post('calculate')
  calculate(@Body() dto: CalculateShippingDto) {
    return this.shippingService.calculate(dto);
  }

  @Post('quote')
  quote(@Body() dto: CalculateShippingDto) {
    return this.shippingService.calculate(dto);
  }
}
