export function validateNetWorthEntry(form) {
  if (!String(form.name ?? '').trim()) return 'Enter a name for this entry.';
  const value = Number(form.value);
  if (String(form.value ?? '').trim() === '' || !Number.isFinite(value) || value <= 0) {
    return 'Enter a finite amount greater than $0. Use Asset or Liability to choose how it affects net worth.';
  }
  if (!['asset', 'liability'].includes(form.type)) return 'Choose Asset or Liability.';
  return null;
}
