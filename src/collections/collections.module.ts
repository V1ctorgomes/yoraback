import { Module } from '@nestjs/common';
import { AdminCollectionsController } from './admin-collections.controller';
import { CollectionsService } from './collections.service';
import { PublicCollectionsController } from './public-collections.controller';

@Module({
  controllers: [PublicCollectionsController, AdminCollectionsController],
  providers: [CollectionsService],
  exports: [CollectionsService],
})
export class CollectionsModule {}
