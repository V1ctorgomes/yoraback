import { Module } from '@nestjs/common';
import { PromotionsModule } from '../promotions/promotions.module';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsDashboardService } from './analytics-dashboard.service';
import { CustomerAnalyticsService } from './customer-analytics.service';
import { InventoryAnalyticsService } from './inventory-analytics.service';
import { OrderAnalyticsService } from './order-analytics.service';
import { ProductAnalyticsService } from './product-analytics.service';
import { RevenueAnalyticsService } from './revenue-analytics.service';

@Module({
  imports: [PromotionsModule],
  controllers: [AnalyticsController],
  providers: [
    AnalyticsDashboardService,
    RevenueAnalyticsService,
    OrderAnalyticsService,
    CustomerAnalyticsService,
    ProductAnalyticsService,
    InventoryAnalyticsService,
  ],
  exports: [AnalyticsDashboardService],
})
export class AnalyticsModule {}
