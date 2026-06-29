import { BadRequestException } from '@nestjs/common';
import { MAX_CUSTOM_PERIOD_DAYS } from './analytics.constants';
import { AnalyticsPeriodPreset } from './dto/analytics-period-query.dto';

export interface AnalyticsDateRange {
  preset: AnalyticsPeriodPreset;
  from: Date;
  to: Date;
}

function startOfDay(date: Date) {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

function endOfDay(date: Date) {
  const value = new Date(date);
  value.setHours(23, 59, 59, 999);
  return value;
}

function daysAgo(days: number, base = new Date()) {
  const value = new Date(base);
  value.setDate(value.getDate() - days);
  return value;
}

export function resolveAnalyticsPeriod(input: {
  period?: AnalyticsPeriodPreset;
  dateFrom?: string;
  dateTo?: string;
}): AnalyticsDateRange {
  const now = new Date();
  const preset = input.period ?? AnalyticsPeriodPreset.THIRTY_DAYS;

  if (preset === AnalyticsPeriodPreset.CUSTOM) {
    if (!input.dateFrom || !input.dateTo) {
      throw new BadRequestException(
        'Informe dateFrom e dateTo para o período personalizado',
      );
    }

    const from = startOfDay(new Date(input.dateFrom));
    const to = endOfDay(new Date(input.dateTo));

    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      throw new BadRequestException('Datas inválidas');
    }

    if (from > to) {
      throw new BadRequestException('dateFrom deve ser anterior a dateTo');
    }

    const diffDays =
      (to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24) + 1;

    if (diffDays > MAX_CUSTOM_PERIOD_DAYS) {
      throw new BadRequestException(
        `Período personalizado limitado a ${MAX_CUSTOM_PERIOD_DAYS} dias`,
      );
    }

    return { preset, from, to };
  }

  switch (preset) {
    case AnalyticsPeriodPreset.TODAY:
      return {
        preset,
        from: startOfDay(now),
        to: endOfDay(now),
      };
    case AnalyticsPeriodPreset.YESTERDAY: {
      const yesterday = daysAgo(1, now);
      return {
        preset,
        from: startOfDay(yesterday),
        to: endOfDay(yesterday),
      };
    }
    case AnalyticsPeriodPreset.SEVEN_DAYS:
      return {
        preset,
        from: startOfDay(daysAgo(6, now)),
        to: endOfDay(now),
      };
    case AnalyticsPeriodPreset.THIRTY_DAYS:
      return {
        preset,
        from: startOfDay(daysAgo(29, now)),
        to: endOfDay(now),
      };
    case AnalyticsPeriodPreset.NINETY_DAYS:
      return {
        preset,
        from: startOfDay(daysAgo(89, now)),
        to: endOfDay(now),
      };
    case AnalyticsPeriodPreset.YEAR:
      return {
        preset,
        from: startOfDay(new Date(now.getFullYear(), 0, 1)),
        to: endOfDay(now),
      };
    default:
      return resolveAnalyticsPeriod({
        period: AnalyticsPeriodPreset.THIRTY_DAYS,
      });
  }
}

export function formatDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function buildDateSeries(from: Date, to: Date) {
  const dates: string[] = [];
  const cursor = startOfDay(from);
  const end = startOfDay(to);

  while (cursor <= end) {
    dates.push(formatDateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return dates;
}
