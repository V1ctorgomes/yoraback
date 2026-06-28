import { Module } from '@nestjs/common';
import { AdminPaymentsController } from './admin-payments.controller';
import { MercadoPagoService } from './mercado-pago.service';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

@Module({
  controllers: [PaymentsController, AdminPaymentsController],
  providers: [PaymentsService, MercadoPagoService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
