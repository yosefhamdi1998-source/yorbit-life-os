import { endOfMonth, format, parseISO } from 'date-fns';

export function totalsLink(year, month, type) {
  const start = `${year}-${month || '01'}-01`;
  const end = month ? format(endOfMonth(parseISO(start)), 'yyyy-MM-dd') : `${year}-12-31`;
  return `/finance?${new URLSearchParams({ start, end, ...(type ? { type } : {}) })}`;
}
