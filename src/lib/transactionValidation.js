import { format, isValid, parseISO } from 'date-fns';

export function validateTransactionForm(form) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(form.date || '') ? parseISO(form.date) : null;
  if (!date || !isValid(date) || format(date, 'yyyy-MM-dd') !== form.date) return 'Choose a valid transaction date.';
  const amount = Number(form.amount);
  if (String(form.amount ?? '').trim() === '' || !Number.isFinite(amount)) return 'Enter an amount.';
  if (amount <= 0) return 'Amount has to be more than $0.';
  if (amount > 10000000) return `Amount has to be $${(10000000).toLocaleString()} or less.`;
  if ((form.title || '').length > 200) return 'Description has to be 200 characters or fewer.';
  return null;
}
