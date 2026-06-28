import { Module } from '@nestjs/common';
import { OrdersCoreModule } from '../orders/orders-core.module';
import { AdminPaymentsController } from './admin-payments.controller';
import { MercadoPagoService } from './mercado-pago.service';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

@Module({
  imports: [OrdersCoreModule],
  controllers: [PaymentsController, AdminPaymentsController],
  providers: [PaymentsService, MercadoPagoService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
