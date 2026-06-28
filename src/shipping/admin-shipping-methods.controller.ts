import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { AdminGuard } from '../auth/guards/access.guard';
import { UpdateShippingMethodDto } from './dto/update-shipping-method.dto';
import { ShippingService } from './shipping.service';

@Controller('admin/shipping-methods')
@AdminGuard()
export class AdminShippingMethodsController {
  constructor(private shippingService: ShippingService) {}

  @Get()
  findAll() {
    return this.shippingService.findAllAdmin();
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateShippingMethodDto) {
    return this.shippingService.updateMethod(id, dto);
  }
}
