import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { AdminGuard } from '../auth/guards/access.guard';
import {
  CreateEmailCampaignDto,
  QueryEmailCampaignsDto,
  ScheduleEmailCampaignDto,
  UpdateEmailCampaignDto,
} from './dto/email-campaign.dto';
import { EmailCampaignService } from './email-campaign.service';

@Controller('admin/email/campaigns')
@AdminGuard()
export class AdminEmailCampaignsController {
  constructor(private campaignsService: EmailCampaignService) {}

  @Get()
  findAll(@Query() query: QueryEmailCampaignsDto) {
    return this.campaignsService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.campaignsService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateEmailCampaignDto) {
    return this.campaignsService.create(dto);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateEmailCampaignDto) {
    return this.campaignsService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.campaignsService.remove(id);
  }

  @Post(':id/duplicate')
  duplicate(@Param('id') id: string) {
    return this.campaignsService.duplicate(id);
  }

  @Post(':id/send')
  send(@Param('id') id: string) {
    return this.campaignsService.sendNow(id);
  }

  @Post(':id/schedule')
  schedule(@Param('id') id: string, @Body() dto: ScheduleEmailCampaignDto) {
    return this.campaignsService.schedule(id, dto);
  }

  @Post(':id/cancel-schedule')
  cancelSchedule(@Param('id') id: string) {
    return this.campaignsService.cancelSchedule(id);
  }
}
