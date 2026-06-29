import { Controller, Get, Query } from '@nestjs/common';
import { AdminGuard } from '../auth/guards/access.guard';
import { CurrentAdmin } from '../auth/decorators/current-admin.decorator';
import type { AuthAdmin } from '../auth/decorators/current-admin.decorator';
import { AnalyticsDashboardService } from './analytics-dashboard.service';
import { AnalyticsPeriodQueryDto } from './dto/analytics-period-query.dto';

@Controller('admin/analytics')
@AdminGuard()
export class AnalyticsController {
  constructor(private analyticsDashboard: AnalyticsDashboardService) {}

  @Get('dashboard')
  async getDashboard(
    @Query() query: AnalyticsPeriodQueryDto,
    @CurrentAdmin() admin: AuthAdmin,
  ) {
    await this.analyticsDashboard.logAccess(admin.email);
    return this.analyticsDashboard.getDashboard(query);
  }

  @Get('revenue')
  getRevenue(@Query() query: AnalyticsPeriodQueryDto) {
    return this.analyticsDashboard.getRevenue(query);
  }

  @Get('orders')
  getOrders(@Query() query: AnalyticsPeriodQueryDto) {
    return this.analyticsDashboard.getOrders(query);
  }

  @Get('products')
  getProducts(@Query() query: AnalyticsPeriodQueryDto) {
    return this.analyticsDashboard.getProducts(query);
  }

  @Get('customers')
  getCustomers(@Query() query: AnalyticsPeriodQueryDto) {
    return this.analyticsDashboard.getCustomers(query);
  }

  @Get('inventory')
  getInventory() {
    return this.analyticsDashboard.getInventory();
  }
}
