import { Controller, Get, Param } from '@nestjs/common';
import { ShippingTrackingService } from './shipping-tracking.service';

@Controller('shipping/tracking')
export class ShippingTrackingController {
  constructor(private trackingService: ShippingTrackingService) {}

  @Get(':trackingCode')
  getTracking(@Param('trackingCode') trackingCode: string) {
    return this.trackingService.getByTrackingCode(trackingCode);
  }
}
