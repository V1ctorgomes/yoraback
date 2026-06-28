import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../auth/guards/access.guard';
import { QueryAdminPaymentsDto } from './dto/query-admin-payments.dto';
import { PaymentsService } from './payments.service';

@Controller('admin/payments')
@AdminGuard()
export class AdminPaymentsController {
  constructor(private paymentsService: PaymentsService) {}

  @Get()
  findAll(@Query() query: QueryAdminPaymentsDto) {
    return this.paymentsService.findAllAdmin(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.paymentsService.findOneAdmin(id);
  }
}
