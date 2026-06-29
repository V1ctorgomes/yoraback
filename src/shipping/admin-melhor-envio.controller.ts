import { Body, Controller, Get, Patch } from '@nestjs/common';
import { AdminGuard } from '../auth/guards/access.guard';
import { UpdateMelhorEnvioConfigDto } from './dto/update-melhor-envio-config.dto';
import { MelhorEnvioConfigService } from './melhor-envio/melhor-envio-config.service';

@Controller('admin/shipping/providers/melhor-envio')
@AdminGuard()
export class AdminMelhorEnvioController {
  constructor(private configService: MelhorEnvioConfigService) {}

  @Get()
  getConfig() {
    return this.configService.getAdminConfig();
  }

  @Patch()
  updateConfig(@Body() dto: UpdateMelhorEnvioConfigDto) {
    return this.configService.updateConfig(dto);
  }

  @Get('oauth-url')
  getOAuthUrl() {
    return this.configService.getOAuthUrl();
  }
}
