import { format, parseISO, isValid } from 'date-fns';
import { getPeriodBounds } from './periods.js';

export function reportLink(period, anchor, transactions, type = 'expense') {
  const { start, end } = getPeriodBounds(period, anchor, transactions);
  return `${type === 'income' ? '/finance' : '/spending-summary'}?${new URLSearchParams({ start, end, type })}`;
}

export function readReportRange(search) {
  const p = new URLSearchParams(search);
  const start = p.get('start'), end = p.get('end');
  const valid = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '') && isValid(parseISO(value)) && format(parseISO(value), 'yyyy-MM-dd') === value;
  if (!valid(start) || !valid(end) || start > end) return null;
  return { start: parseISO(start), end: parseISO(end), label: `${format(parseISO(start), 'MMM d, yyyy')} – ${format(parseISO(end), 'MMM d, yyyy')}` };
}
