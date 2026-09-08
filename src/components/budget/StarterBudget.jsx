import { useMemo, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { buildStarterBudget } from '@/lib/starterBudget';
import { FREE_BUDGET_LIMIT } from '@/lib/planLimits';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function StarterBudget({ transactions, budgets, month, isPro, onSaved }) {
  const suggestion = useMemo(() => buildStarterBudget(transactions, month), [transactions, month]);
  const [edits, setEdits] = useState({});
  const [incomeEdits, setIncomeEdits] = useState({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const lock = useRef(false);
  const existing = budgets.filter(b => b.month === month);
  const available = isPro ? Infinity : Math.max(0, FREE_BUDGET_LIMIT - new Set(existing.map(b => b.category)).size);
  const candidates = (suggestion?.rows || []).filter(r => !existing.some(b => b.category === r.category)).slice(0, available);
  if (!suggestion || !candidates.length) return null;
  const planningIncome = Number(incomeEdits[month] ?? suggestion.incomeBaseline);
  const validIncome = Number.isFinite(planningIncome) && planningIncome >= 0;
  const amount = row => Number(edits[`${month}:${row.category}`] ?? row.monthly_limit);
  const total = candidates.reduce((sum,row) => sum + (Number.isFinite(amount(row)) ? amount(row) : 0), 0);
  const invalid = candidates.some(row => !Number.isFinite(amount(row)) || amount(row) <= 0);
  const save = async () => {
    if (lock.current || invalid) return;
    lock.current = true; setSaving(true); setMessage('');
    let created = 0;
    try {
      const fresh = await base44.entities.Budget.list();
      const current = fresh.filter(b => b.month === month);
      let room = isPro ? Infinity : Math.max(0, FREE_BUDGET_LIMIT - new Set(current.map(b => b.category)).size);
      for (const row of candidates) {
        if (!room || current.some(b => b.category === row.category)) continue;
        await base44.entities.Budget.create({ category: row.category, monthly_limit: Math.round(amount(row) * 100) / 100, month });
        created++; room--;
      }
      setMessage(created ? `Saved ${created} budget categories.` : 'Your existing budgets are already up to date.');
    } catch {
      setMessage(created ? `Saved ${created} categories before the connection failed. Reloaded your budgets; you can retry the remaining ones.` : 'Could not save the starter budget. Please try again.');
    } finally {
      await onSaved(); lock.current = false; setSaving(false);
    }
  };
  return <section className="rounded-2xl border border-primary/25 bg-primary/5 p-4 sm:p-5 mb-5" aria-label="Starter budget">
    <h2 className="text-base font-semibold">A starting plan from your spending</h2>
    <p className="text-sm text-muted-foreground mt-1">Based on recorded monthly averages from {suggestion.months[0]} through {suggestion.months.at(-1)}. Review the limits before saving; missing transactions can change the picture.</p>
    <p className="text-xs text-muted-foreground mt-2">Existing budgets stay as you set them. {isPro ? '' : `Your free plan includes ${FREE_BUDGET_LIMIT} categories; this draft starts with your largest uncovered categories.`}</p>
    <div className="grid sm:grid-cols-2 gap-3 my-4">{candidates.map(row => <label key={row.category} className="flex items-center justify-between gap-3 rounded-xl bg-card border border-border p-3"><span className="capitalize text-sm font-medium">{row.category}</span><span className="flex items-center gap-1 text-sm">$<Input aria-label={`${row.category} starter limit`} type="number" min="0.01" step="0.01" className="w-28" value={edits[`${month}:${row.category}`] ?? row.monthly_limit} onChange={e => setEdits({...edits, [`${month}:${row.category}`]: e.target.value})} /></span></label>)}</div>
    <p className="text-sm mb-3">Draft total: <strong>${total.toLocaleString('en-US', {maximumFractionDigits: 2})}</strong></p>
    <div className="rounded-xl border border-border bg-card p-3 mb-3">
      <label className="flex flex-wrap items-center justify-between gap-3 text-sm font-medium">Monthly planning income ($)<Input aria-label="Monthly planning income" type="number" min="0" step="0.01" className="w-36" value={incomeEdits[month] ?? suggestion.incomeBaseline} onChange={e => setIncomeEdits({...incomeEdits, [month]: e.target.value})} /></label>
      <p className="text-xs text-muted-foreground mt-2">Set your expected income for this draft. This does not change bank records and resets when you leave this page. Historical reference: ${suggestion.incomeBaseline.toLocaleString('en-US')}.</p>
      {!validIncome && <p role="alert" className="text-sm text-destructive mt-2">Enter a valid amount of zero or more.</p>}
    </div>
    {validIncome && (total + existing.reduce((sum,b) => sum + Number(b.monthly_limit || 0), 0)) > planningIncome && <p className="text-sm text-amber-700 dark:text-amber-300 mb-3">Your category limits are above your planning income. You can still save them; review the difference when planning your month.</p>}
    <Button disabled={saving || invalid} onClick={save}>{saving ? 'Saving…' : 'Save reviewed starter budget'}</Button>
    {message && <p role="status" className="text-sm mt-3">{message}</p>}
  </section>;
}
