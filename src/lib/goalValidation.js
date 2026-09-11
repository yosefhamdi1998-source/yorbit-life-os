export function validateGoalAmounts(form) {
  const target = Number(form.target_amount);
  if (!Number.isFinite(target) || target <= 0) return 'Enter a target amount greater than $0.';
  const saved = Number(form.current_amount);
  if (!Number.isFinite(saved) || saved < 0) return 'Already saved must be $0 or more.';
  return null;
}
