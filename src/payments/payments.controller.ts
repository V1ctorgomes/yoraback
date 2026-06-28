import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
} from '@nestjs/common';
import { CreatePaymentDto, SimulatePaymentDto } from './dto/create-payment.dto';
import { PaymentsService } from './payments.service';

@Controller('payments')
export class PaymentsController {
  constructor(private paymentsService: PaymentsService) {}

  @Get('config')
  getConfig() {
    return this.paymentsService.getPublicConfig();
  }

  @Post('create')
  create(@Body() dto: CreatePaymentDto) {
    return this.paymentsService.createPayment(dto);
  }

  @Get('order/:orderNumber')
  findByOrder(@Param('orderNumber') orderNumber: string) {
    return this.paymentsService.findLatestByOrderNumber(orderNumber);
  }

  @Post('webhook/mercadopago')
  webhook(
    @Body() body: Record<string, unknown>,
    @Headers() headers: Record<string, string | undefined>,
  ) {
    return this.paymentsService.handleWebhook(body, headers);
  }

  @Post('simulate')
  simulate(@Body() dto: SimulatePaymentDto) {
    return this.paymentsService.simulatePayment(dto);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.paymentsService.findById(id);
  }
}
