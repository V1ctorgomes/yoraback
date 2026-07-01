import { Type, Transform } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export enum CustomerSegment {
  NEW = 'new',
  RECURRING = 'recurring',
  VIP = 'vip',
  INACTIVE = 'inactive',
}

export enum CrmCustomerSort {
  NEWEST = 'newest',
  OLDEST = 'oldest',
  HIGHEST_SPENT = 'highest_spent',
  LOWEST_SPENT = 'lowest_spent',
  MOST_ORDERS = 'most_orders',
}

export class QueryAdminCrmCustomersDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(CustomerSegment)
  segment?: CustomerSegment;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  hasOrders?: boolean;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  hasAbandonedCart?: boolean;

  @IsOptional()
  @IsString()
  state?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsDateString()
  registeredFrom?: string;

  @IsOptional()
  @IsDateString()
  registeredTo?: string;

  @IsOptional()
  @IsDateString()
  lastPurchaseFrom?: string;

  @IsOptional()
  @IsDateString()
  lastPurchaseTo?: string;

  @IsOptional()
  @IsEnum(CrmCustomerSort)
  sort?: CrmCustomerSort = CrmCustomerSort.NEWEST;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number = 20;
}

export class ExportAdminCrmCustomersDto extends QueryAdminCrmCustomersDto {
  @IsOptional()
  @IsIn(['csv', 'xlsx', 'pdf'])
  format?: 'csv' | 'xlsx' | 'pdf' = 'csv';
}
