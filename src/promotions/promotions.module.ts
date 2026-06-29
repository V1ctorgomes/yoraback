import { Module } from '@nestjs/common';
import { AdminPromotionsController } from './admin-promotions.controller';
import { PromotionAnalyticsService } from './promotion-analytics.service';
import { PromotionEngineService } from './promotion-engine.service';
import { PublicPromotionsController } from './public-promotions.controller';
import { PromotionsService } from './promotions.service';

@Module({
  controllers: [PublicPromotionsController, AdminPromotionsController],
  providers: [
    PromotionsService,
    PromotionEngineService,
    PromotionAnalyticsService,
  ],
  exports: [PromotionsService, PromotionEngineService],
})
export class PromotionsModule {}
