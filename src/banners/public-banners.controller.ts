import { Controller, Get } from '@nestjs/common';
import { BannersService } from './banners.service';

@Controller('banners')
export class PublicBannersController {
  constructor(private bannersService: BannersService) {}

  @Get()
  findActive() {
    return this.bannersService.findActive();
  }
}
