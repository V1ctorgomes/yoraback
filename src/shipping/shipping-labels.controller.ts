import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
} from '@nestjs/common';
import { AdminGuard } from '../auth/guards/access.guard';
import {
  CreateShippingLabelDto,
  PrintShippingLabelsBatchDto,
} from './dto/create-shipping-label.dto';
import { ShippingLabelsService } from './shipping-labels.service';

@Controller('shipping/labels')
@AdminGuard()
export class ShippingLabelsController {
  constructor(private labelsService: ShippingLabelsService) {}

  @Post()
  create(@Body() dto: CreateShippingLabelDto) {
    return this.labelsService.purchaseLabel(dto);
  }

  @Post('batch/print')
  printBatch(@Body() dto: PrintShippingLabelsBatchDto) {
    return this.labelsService.printBatch(dto.orderIds);
  }

  @Get(':id')
  getByOrder(@Param('id') id: string) {
    return this.labelsService.getLabel(id);
  }

  @Delete(':id')
  cancel(@Param('id') id: string) {
    return this.labelsService.cancelLabel(id);
  }

  @Post(':id/print')
  print(@Param('id') id: string) {
    return this.labelsService.printLabel(id);
  }
}
