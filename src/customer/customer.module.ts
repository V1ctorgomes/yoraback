import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CustomerAccountService } from './customer-account.service';
import { MeController } from './me.controller';

@Module({
  imports: [AuthModule],
  controllers: [MeController],
  providers: [CustomerAccountService],
})
export class CustomerModule {}
