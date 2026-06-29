import { Controller, Get, Query, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { MelhorEnvioConfigService } from './melhor-envio/melhor-envio-config.service';

@Controller('admin/shipping/providers/melhor-envio/oauth')
export class MelhorEnvioOAuthController {
  constructor(
    private configService: MelhorEnvioConfigService,
    private appConfig: ConfigService,
  ) {}

  @Get('callback')
  async callback(@Query('code') code: string, @Res() res: Response) {
    await this.configService.handleOAuthCallback(code);
    const frontendUrl =
      this.appConfig.get<string>('FRONTEND_URL') ?? 'http://localhost:3000';
    res.redirect(
      `${frontendUrl.replace(/\/$/, '')}/admin/shipping/melhor-envio?connected=1`,
    );
  }
}
