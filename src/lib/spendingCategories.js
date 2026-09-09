// Group the records themselves so imported or newly introduced categories
// cannot disappear from the charts while remaining in the spending total.
export function spendingCategories(transactions) {
  const totals = new Map();
  for (const transaction of transactions) {
    if (transaction.type !== 'expense') continue;
    const category = transaction.category || 'other';
    totals.set(category, (totals.get(category) || 0) + (transaction.amount || 0));
  }
  return [...totals].map(([name, spent]) => ({ name, spent }))
    .filter(row => row.spent > 0)
    .sort((a, b) => b.spent - a.spent);
}
