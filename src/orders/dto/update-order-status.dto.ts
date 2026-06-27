import { OrderStatus } from '@prisma/client';
import { IsIn } from 'class-validator';
import { ADMIN_UPDATABLE_STATUSES } from '../order-status.transitions';

export class UpdateOrderStatusDto {
  @IsIn(ADMIN_UPDATABLE_STATUSES)
  status!: OrderStatus;
}
