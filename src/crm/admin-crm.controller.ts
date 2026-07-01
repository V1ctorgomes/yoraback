import {
  Controller,
  Get,
  Param,
  Query,
} from '@nestjs/common';
import { AdminGuard } from '../auth/guards/access.guard';
import { CurrentAdmin } from '../auth/decorators/current-admin.decorator';
import type { AuthAdmin } from '../auth/decorators/current-admin.decorator';
import { AdminCrmService } from './admin-crm.service';
import {
  ExportAdminCrmCustomersDto,
  QueryAdminCrmCustomersDto,
} from './dto/query-admin-crm-customers.dto';

@Controller('admin/crm')
@AdminGuard()
export class AdminCrmController {
  constructor(private crmService: AdminCrmService) {}

  @Get('customers')
  findAll(
    @Query() query: QueryAdminCrmCustomersDto,
    @CurrentAdmin() admin: AuthAdmin,
  ) {
    return this.crmService.findAll(query, admin);
  }

  @Get('customers/:id')
  findOne(@Param('id') id: string, @CurrentAdmin() admin: AuthAdmin) {
    return this.crmService.findOne(id, admin);
  }

  @Get('export')
  export(
    @Query() query: ExportAdminCrmCustomersDto,
    @CurrentAdmin() admin: AuthAdmin,
  ) {
    return this.crmService.exportCustomers(query, admin);
  }
}
