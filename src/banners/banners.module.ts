import { Module } from '@nestjs/common';
import { BannersService } from './banners.service';
import { PublicBannersController } from './public-banners.controller';
import { AdminBannersController } from './admin-banners.controller';

@Module({
  controllers: [PublicBannersController, AdminBannersController],
  providers: [BannersService],
  exports: [BannersService],
})
export class BannersModule {}
