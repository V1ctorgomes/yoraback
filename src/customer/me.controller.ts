import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { ChangePasswordDto } from '../auth/dto/change-password.dto';
import { CustomerGuard } from '../auth/guards/access.guard';
import { CustomerAccountService } from './customer-account.service';
import { CreateCustomerAddressDto } from './dto/create-customer-address.dto';
import { QueryCustomerOrdersDto } from './dto/query-customer-orders.dto';
import { UpdateCustomerAddressDto } from './dto/update-customer-address.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { UpdateMeProfileDto } from './dto/update-me-profile.dto';

@Controller('me')
@CustomerGuard()
export class MeController {
  constructor(private customerAccountService: CustomerAccountService) {}

  @Get('customer')
  getCustomer(@CurrentUser() user: AuthUser) {
    return this.customerAccountService.getCustomer(user.id);
  }

  @Patch('customer')
  updateCustomer(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateCustomerDto,
  ) {
    return this.customerAccountService.updateCustomerProfile(user.id, dto);
  }

  @Get()
  getOverview(@CurrentUser() user: AuthUser) {
    return this.customerAccountService.getAccountOverview(user.id);
  }

  @Patch()
  updateProfile(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateMeProfileDto,
  ) {
    return this.customerAccountService.updateProfile(user.id, dto);
  }

  @Patch('change-password')
  changePassword(
    @CurrentUser() user: AuthUser,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.customerAccountService.changePassword(user.id, dto);
  }

  @Get('addresses')
  listAddresses(@CurrentUser() user: AuthUser) {
    return this.customerAccountService.listAddresses(user.id);
  }

  @Post('addresses')
  createAddress(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateCustomerAddressDto,
  ) {
    return this.customerAccountService.createAddress(user.id, dto);
  }

  @Patch('addresses/:id')
  updateAddress(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateCustomerAddressDto,
  ) {
    return this.customerAccountService.updateAddress(user.id, id, dto);
  }

  @Delete('addresses/:id')
  deleteAddress(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.customerAccountService.deleteAddress(user.id, id);
  }

  @Get('orders')
  listOrders(
    @CurrentUser() user: AuthUser,
    @Query() query: QueryCustomerOrdersDto,
  ) {
    return this.customerAccountService.listOrders(user.id, query);
  }

  @Get('orders/:number')
  getOrder(@CurrentUser() user: AuthUser, @Param('number') number: string) {
    return this.customerAccountService.getOrderByNumber(user.id, number);
  }
}
