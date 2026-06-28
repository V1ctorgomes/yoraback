import { Type } from 'class-transformer';
import { IsUUID, ValidateNested } from 'class-validator';
import { CheckoutAddressDto } from './checkout-address.dto';
import { CheckoutCustomerDto } from './checkout-customer.dto';

export class CheckoutDto {
  @ValidateNested()
  @Type(() => CheckoutCustomerDto)
  customer!: CheckoutCustomerDto;

  @ValidateNested()
  @Type(() => CheckoutAddressDto)
  address!: CheckoutAddressDto;

  @IsUUID()
  shippingMethodId!: string;
}
