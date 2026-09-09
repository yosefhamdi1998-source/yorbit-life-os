import { differenceInCalendarDays, differenceInCalendarMonths } from 'date-fns';

export function reportAverageWindow(start, end, monthly, today = new Date()) {
  const cutoff = end > today ? today : end;
  if (cutoff < start) return { count: 0, partial: true };
  const count = (monthly
    ? differenceInCalendarMonths(cutoff, start)
    : differenceInCalendarDays(cutoff, start)) + 1;
  return { count, partial: end > today };
}
