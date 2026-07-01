import { Module } from '@nestjs/common';
import { AdminCrmController } from './admin-crm.controller';
import { AdminCrmService } from './admin-crm.service';

@Module({
  controllers: [AdminCrmController],
  providers: [AdminCrmService],
})
export class CrmModule {}
