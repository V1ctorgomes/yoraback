import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { LogisticStatus } from '@prisma/client';

export class QueryExpeditionDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(LogisticStatus)
  logisticStatus?: LogisticStatus;

  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  limit?: number;
}
