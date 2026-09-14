export function validateBudgetAmount(raw) {
  const amount = Number(raw);
  if (String(raw ?? '').trim() === '' || !Number.isFinite(amount) || amount <= 0) return 'Enter a monthly limit greater than $0.';
  if (amount > 10000000) return 'Monthly limit must be $10,000,000 or less.';
  return null;
}
