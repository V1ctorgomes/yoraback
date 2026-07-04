import { Controller, Get, Query } from '@nestjs/common';
import { AdminGuard } from '../auth/guards/access.guard';
import { QueryEmailLogsDto } from './dto/email-campaign.dto';
import { EmailDashboardService } from './email-dashboard.service';

@Controller('admin/email/dashboard')
@AdminGuard()
export class AdminEmailDashboardController {
  constructor(private dashboardService: EmailDashboardService) {}

  @Get()
  getDashboard() {
    return this.dashboardService.getDashboard();
  }
}

@Controller('admin/email/logs')
@AdminGuard()
export class AdminEmailLogsController {
  constructor(private dashboardService: EmailDashboardService) {}

  @Get()
  findLogs(@Query() query: QueryEmailLogsDto) {
    return this.dashboardService.findLogs(query);
  }
}
