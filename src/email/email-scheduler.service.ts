import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EmailCampaignService } from './email-campaign.service';

@Injectable()
export class EmailSchedulerService {
  constructor(private campaigns: EmailCampaignService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async handleScheduledCampaigns() {
    await this.campaigns.processScheduledCampaigns();
  }
}
