import { addDays, format } from 'date-fns';

// This totals recorded unpaid bills, not an estimate of available cash.
export function billsDueThisWeek(bills, today = new Date()) {
  const start = format(today, 'yyyy-MM-dd');
  const end = format(addDays(today, 6), 'yyyy-MM-dd');
  const rows = bills.filter(b => !b.is_paid && b.due_date >= start && b.due_date <= end);
  return { start, end, count: rows.length, total: rows.reduce((sum,b) => sum + (Number(b.amount) || 0), 0) };
}
