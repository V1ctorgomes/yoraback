import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentAdmin } from '../auth/decorators/current-admin.decorator';
import type { AuthAdmin } from '../auth/decorators/current-admin.decorator';
import { AdminGuard } from '../auth/guards/access.guard';
import { AdminOrdersService } from './admin-orders.service';
import { QueryAdminOrdersDto } from './dto/query-admin-orders.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { UpdateOrderTrackingDto } from './dto/update-order-tracking.dto';

@Controller('admin/orders')
@AdminGuard()
export class AdminOrdersController {
  constructor(private adminOrdersService: AdminOrdersService) {}

  @Get('dashboard')
  getDashboard() {
    return this.adminOrdersService.getDashboard();
  }

  @Get()
  findAll(@Query() query: QueryAdminOrdersDto) {
    return this.adminOrdersService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.adminOrdersService.findOne(id);
  }

  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateOrderStatusDto,
    @CurrentAdmin() admin: AuthAdmin,
  ) {
    return this.adminOrdersService.updateStatus(id, dto, admin);
  }

  @Patch(':id/tracking')
  updateTracking(@Param('id') id: string, @Body() dto: UpdateOrderTrackingDto) {
    return this.adminOrdersService.updateTracking(id, dto);
  }
}
