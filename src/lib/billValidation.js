import { format, isValid, parseISO } from 'date-fns';

export function validateBillForm(form) {
  if (!String(form.name ?? '').trim()) return 'Enter a bill name.';
  const amount = Number(form.amount);
  if (String(form.amount ?? '').trim() === '' || !Number.isFinite(amount) || amount <= 0) return 'Enter a bill amount greater than $0.';
  if (amount > 10000000) return 'Bill amount must be $10,000,000 or less.';
  const date = /^\d{4}-\d{2}-\d{2}$/.test(form.due_date || '') ? parseISO(form.due_date) : null;
  if (!date || !isValid(date) || format(date, 'yyyy-MM-dd') !== form.due_date) return 'Choose a valid bill due date.';
  return null;
}
