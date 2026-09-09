import { format, isSameMonth, isSameYear } from 'date-fns';

export function reportTrendLabel(date, start, end, monthly) {
  if (monthly) return format(date, isSameYear(start, end) ? 'MMM' : 'MMM yyyy');
  if (!isSameYear(start, end)) return format(date, 'MMM d, yyyy');
  return format(date, isSameMonth(start, end) ? 'd' : 'MMM d');
}
