import { Controller, Get, Post, Query } from '@nestjs/common';
import { AdminGuard } from '../auth/guards/access.guard';
import {
  ExportAdminNewsletterDto,
  QueryAdminNewsletterDto,
} from './dto/query-admin-newsletter.dto';
import { NewsletterService } from './newsletter.service';

@Controller('admin/newsletter')
@AdminGuard()
export class AdminNewsletterController {
  constructor(private newsletterService: NewsletterService) {}

  @Get()
  findAll(@Query() query: QueryAdminNewsletterDto) {
    return this.newsletterService.findAllAdmin(query);
  }

  @Get('export')
  export(@Query() query: ExportAdminNewsletterDto) {
    return this.newsletterService.export(query);
  }

  @Post('sync-resend')
  syncResend() {
    return this.newsletterService.syncActiveSubscribersToResend();
  }
}
