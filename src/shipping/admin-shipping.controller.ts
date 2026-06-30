import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { AdminGuard } from '../auth/guards/access.guard';
import { UpdateShippingCarrierDto } from './dto/update-shipping-carrier.dto';
import { UpdateShippingServiceDto } from './dto/update-shipping-service.dto';
import { ShippingSyncService } from './shipping-sync.service';

@Controller('admin/shipping')
@AdminGuard()
export class AdminShippingController {
  constructor(private syncService: ShippingSyncService) {}

  @Get('providers')
  getProviders() {
    return this.syncService.getAdminProviders();
  }

  @Post('sync')
  sync() {
    return this.syncService.syncFromMelhorEnvio();
  }

  @Patch('carriers/:id')
  updateCarrier(
    @Param('id') id: string,
    @Body() dto: UpdateShippingCarrierDto,
  ) {
    return this.syncService.updateCarrier(id, dto);
  }

  @Patch('services/:id')
  updateService(
    @Param('id') id: string,
    @Body() dto: UpdateShippingServiceDto,
  ) {
    return this.syncService.updateService(id, dto);
  }
}
