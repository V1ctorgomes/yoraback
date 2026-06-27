import { Type } from 'class-transformer';
import { IsEnum, ValidateNested } from 'class-validator';
import { CheckoutAddressDto } from './checkout-address.dto';
import { CheckoutCustomerDto } from './checkout-customer.dto';
import { ShippingMethod } from './shipping-method.enum';

export class CheckoutDto {
  @ValidateNested()
  @Type(() => CheckoutCustomerDto)
  customer!: CheckoutCustomerDto;

  @ValidateNested()
  @Type(() => CheckoutAddressDto)
  address!: CheckoutAddressDto;

  @IsEnum(ShippingMethod)
  shippingMethod!: ShippingMethod;
}
