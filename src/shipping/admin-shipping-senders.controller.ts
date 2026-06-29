import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { AdminGuard } from '../auth/guards/access.guard';
import {
  CreateShippingSenderDto,
  UpdateShippingSenderDto,
} from './dto/create-shipping-sender.dto';
import { ShippingSendersService } from './shipping-senders.service';

@Controller('admin/shipping/senders')
@AdminGuard()
export class AdminShippingSendersController {
  constructor(private sendersService: ShippingSendersService) {}

  @Get()
  findAll() {
    return this.sendersService.findAll();
  }

  @Post()
  create(@Body() dto: CreateShippingSenderDto) {
    return this.sendersService.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateShippingSenderDto) {
    return this.sendersService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.sendersService.remove(id);
  }
}
