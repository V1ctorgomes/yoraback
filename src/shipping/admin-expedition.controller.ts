import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { AdminGuard } from '../auth/guards/access.guard';
import { QueryExpeditionDto } from './dto/query-expedition.dto';
import { ExpeditionService } from './expedition.service';
import { ShippingTrackingService } from './shipping-tracking.service';

@Controller('admin/expedition')
@AdminGuard()
export class AdminExpeditionController {
  constructor(
    private expeditionService: ExpeditionService,
    private trackingService: ShippingTrackingService,
  ) {}

  @Get()
  findAll(@Query() query: QueryExpeditionDto) {
    return this.expeditionService.findAll(query);
  }

  @Get(':orderId/history')
  getHistory(@Param('orderId') orderId: string) {
    return this.expeditionService.getHistory(orderId);
  }

  @Post(':orderId/sync-tracking')
  syncTracking(@Param('orderId') orderId: string) {
    return this.trackingService.syncOrder(orderId);
  }
}
