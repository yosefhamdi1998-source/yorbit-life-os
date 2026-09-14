import { format, isValid, parseISO } from 'date-fns';

export function readReportSelection(search) {
  const params = new URLSearchParams(search);
  const period = params.get('period');
  if (!['monthly', 'biweekly', 'yearly'].includes(period)) return null;
  const raw = params.get('cursor');
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw || '')) {
    const cursor = parseISO(raw);
    if (isValid(cursor) && format(cursor, 'yyyy-MM-dd') === raw) return { period, cursor };
  }
  const year = params.get('year');
  if (period === 'yearly' && /^[1-9]\d{3}$/.test(year || '')) return { period, cursor: new Date(Number(year), 0, 1) };
  return null;
}

export function reportSelectionSearch(search, period, cursor) {
  const params = new URLSearchParams(search);
  for (const name of ['start', 'end', 'year']) params.delete(name);
  params.set('period', period);
  params.set('cursor', format(cursor, 'yyyy-MM-dd'));
  return params.toString();
}
