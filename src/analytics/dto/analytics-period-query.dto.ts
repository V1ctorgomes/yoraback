import { IsDateString, IsEnum, IsOptional } from 'class-validator';

export enum AnalyticsPeriodPreset {
  TODAY = 'today',
  YESTERDAY = 'yesterday',
  SEVEN_DAYS = '7d',
  THIRTY_DAYS = '30d',
  NINETY_DAYS = '90d',
  YEAR = 'year',
  CUSTOM = 'custom',
}

export class AnalyticsPeriodQueryDto {
  @IsOptional()
  @IsEnum(AnalyticsPeriodPreset)
  period?: AnalyticsPeriodPreset;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;
}
