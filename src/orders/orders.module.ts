import { Module } from '@nestjs/common';
import { AdminOrdersController } from './admin-orders.controller';
import { AdminOrdersService } from './admin-orders.service';
import { OrdersCoreModule } from './orders-core.module';

@Module({
  imports: [OrdersCoreModule],
  controllers: [AdminOrdersController],
  providers: [AdminOrdersService],
})
export class OrdersModule {}
