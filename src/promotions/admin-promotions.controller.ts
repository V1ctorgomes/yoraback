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
import { CreatePromotionDto } from './dto/create-promotion.dto';
import { UpdatePromotionDto } from './dto/update-promotion.dto';
import { PromotionAnalyticsService } from './promotion-analytics.service';
import { PromotionsService } from './promotions.service';

@Controller('admin/promotions')
@AdminGuard()
export class AdminPromotionsController {
  constructor(
    private promotionsService: PromotionsService,
    private analyticsService: PromotionAnalyticsService,
  ) {}

  @Get('dashboard')
  getDashboard() {
    return this.analyticsService.getDashboardMetrics();
  }

  @Post()
  create(@Body() dto: CreatePromotionDto) {
    return this.promotionsService.create(dto);
  }

  @Get()
  findAll() {
    return this.promotionsService.findAllAdmin();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.promotionsService.findOneAdmin(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdatePromotionDto) {
    return this.promotionsService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.promotionsService.remove(id);
  }
}
