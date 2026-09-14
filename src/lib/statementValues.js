import { format, isValid, parseISO } from 'date-fns';

// USD statement notation: signed numbers, grouped thousands and accounting negatives.
// Reject malformed values instead of silently turning "12abc34" into 1234.
export function parseStatementAmount(raw) {
  let value = String(raw ?? '').trim();
  const parentheses = /^\(.*\)$/.test(value);
  if (parentheses) value = value.slice(1, -1).trim();
  value = value.replace(/\s+/g, '');
  if (!/^[+-]?\$?(?:\d{1,3}(?:,\d{3})+|\d+|)(?:\.\d{1,2})?$/.test(value) &&
      !/^\$[+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?$/.test(value)) return null;
  value = value.replace(/[$,]/g, '');
  if (!/\d/.test(value) || (parentheses && /^[+-]/.test(value))) return null;
  const amount = Number(value);
  return Number.isFinite(amount) ? (parentheses ? -amount : amount) : null;
}

export function parseStatementDate(raw) {
  const value = String(raw ?? '').trim();
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}(?:$|[T ])/.test(value)) {
    const datePart = value.slice(0, 10);
    const parsed = parseISO(value);
    const calendar = parseISO(datePart);
    return isValid(parsed) && isValid(calendar) && format(calendar, 'yyyy-MM-dd') === datePart ? datePart : null;
  }
  const parsed = new Date(value);
  if (!isValid(parsed)) return null;
  // Date() rolls 02/30 into March. Verify the calendar parts for US bank dates.
  const numeric = value.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})(?:$|\s)/);
  if (numeric) {
    const [, month, day, year] = numeric;
    const fullYear = year.length === 2 ? Number(year) + (Number(year) < 50 ? 2000 : 1900) : Number(year);
    if (parsed.getFullYear() !== fullYear || parsed.getMonth() + 1 !== Number(month) || parsed.getDate() !== Number(day)) return null;
  } else {
    const named = value.match(/^(?:([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})|(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4}))$/);
    if (!named || parsed.getDate() !== Number(named[2] || named[4])) return null;
  }
  return format(parsed, 'yyyy-MM-dd');
}

export function skippedStatementRows(total, valid) {
  const skipped = total - valid;
  return skipped > 0 ? `${valid} ready; ${skipped} skipped (missing/invalid date, invalid amount, or zero amount). Check the statement before importing.` : undefined;
}
