import { Body, Controller, Get, Post, Put } from '@nestjs/common';
import { AdminGuard } from '../auth/guards/access.guard';
import {
  TestEmailConnectionDto,
  UpdateEmailSettingsDto,
} from './dto/update-email-settings.dto';
import { EmailSettingsService } from './email-settings.service';

@Controller('admin/email/settings')
@AdminGuard()
export class AdminEmailSettingsController {
  constructor(private settingsService: EmailSettingsService) {}

  @Get()
  getSettings() {
    return this.settingsService.getSettings();
  }

  @Put()
  updateSettings(@Body() dto: UpdateEmailSettingsDto) {
    return this.settingsService.updateSettings(dto);
  }
}

@Controller('admin/email')
@AdminGuard()
export class AdminEmailTestController {
  constructor(private settingsService: EmailSettingsService) {}

  @Post('test')
  testConnection(@Body() dto: TestEmailConnectionDto) {
    return this.settingsService.testConnection(dto);
  }
}
