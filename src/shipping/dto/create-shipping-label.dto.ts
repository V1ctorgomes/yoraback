import { IsNumber, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateShippingLabelDto {
  @IsUUID()
  orderId!: string;

  @IsOptional()
  @IsNumber()
  serviceId?: number;
}

export class PrintShippingLabelsBatchDto {
  @IsUUID('4', { each: true })
  orderIds!: string[];
}
