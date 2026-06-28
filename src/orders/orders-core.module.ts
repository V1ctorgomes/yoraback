import { Module } from '@nestjs/common';
import { OrderExpirationService } from './order-expiration.service';
import { OrderStockService } from './order-stock.service';

@Module({
  providers: [OrderStockService, OrderExpirationService],
  exports: [OrderStockService, OrderExpirationService],
})
export class OrdersCoreModule {}
