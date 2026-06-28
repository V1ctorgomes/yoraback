import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CustomerAccountService } from './customer-account.service';
import { CustomersCoreModule } from './customers-core.module';
import { MeController } from './me.controller';

@Module({
  imports: [AuthModule, CustomersCoreModule],
  controllers: [MeController],
  providers: [CustomerAccountService],
})
export class CustomerModule {}
