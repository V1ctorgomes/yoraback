import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
} from 'class-validator';
import { PaymentMethodType } from '@prisma/client';

export class CreatePaymentDto {
  @IsString()
  @MinLength(5)
  orderNumber!: string;

  @IsEnum(PaymentMethodType)
  paymentMethod!: PaymentMethodType;

  @IsOptional()
  @IsString()
  token?: string;

  @IsOptional()
  @IsString()
  paymentMethodId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  installments?: number;

  @IsOptional()
  @IsString()
  issuerId?: string;
}

export class SimulatePaymentDto {
  @IsUUID()
  paymentId!: string;

  @IsIn(['APPROVED', 'REJECTED'])
  status!: 'APPROVED' | 'REJECTED';
}
