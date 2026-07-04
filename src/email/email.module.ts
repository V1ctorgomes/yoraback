import { Module } from '@nestjs/common';
import {
  AdminEmailCampaignsController,
} from './admin-email-campaigns.controller';
import {
  AdminEmailDashboardController,
  AdminEmailLogsController,
} from './admin-email-dashboard.controller';
import {
  AdminEmailSettingsController,
  AdminEmailTestController,
} from './admin-email-settings.controller';
import { AdminEmailTemplatesController } from './admin-email-templates.controller';
import { EmailCampaignService } from './email-campaign.service';
import { EmailDashboardService } from './email-dashboard.service';
import { EmailEncryptionService } from './email-encryption.service';
import { EmailSchedulerService } from './email-scheduler.service';
import { EmailSettingsService } from './email-settings.service';
import { EmailTemplateService } from './email-template.service';
import { EmailService } from './email.service';

@Module({
  controllers: [
    AdminEmailSettingsController,
    AdminEmailTestController,
    AdminEmailTemplatesController,
    AdminEmailCampaignsController,
    AdminEmailDashboardController,
    AdminEmailLogsController,
  ],
  providers: [
    EmailEncryptionService,
    EmailSettingsService,
    EmailService,
    EmailTemplateService,
    EmailCampaignService,
    EmailDashboardService,
    EmailSchedulerService,
  ],
  exports: [EmailService],
})
export class EmailModule {}
