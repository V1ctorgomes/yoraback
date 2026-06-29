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
  CreateShippingPackageDto,
  UpdateShippingPackageDto,
} from './dto/create-shipping-package.dto';
import { ShippingPackagesService } from './shipping-packages.service';

@Controller('admin/shipping/packages')
@AdminGuard()
export class AdminShippingPackagesController {
  constructor(private packagesService: ShippingPackagesService) {}

  @Get()
  findAll() {
    return this.packagesService.findAll();
  }

  @Post()
  create(@Body() dto: CreateShippingPackageDto) {
    return this.packagesService.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateShippingPackageDto) {
    return this.packagesService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.packagesService.remove(id);
  }
}
