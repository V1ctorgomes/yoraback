import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateOrderTrackingDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  trackingCode?: string | null;
}
