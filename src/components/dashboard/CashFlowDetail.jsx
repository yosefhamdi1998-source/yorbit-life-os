import { Link } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
const money = value => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(value || 0));

export default function CashFlowDetail({ bucket, onClose, onPrevious, onNext }) {
  const rows = bucket?.transactions || [];
  const groups = {};
  rows.filter(t => t.type === 'expense').forEach(t => {
    const category = t.category || 'other';
    groups[category] = (groups[category] || 0) + Number(t.amount || 0);
  });
  const categories = Object.entries(groups).sort((a, b) => b[1] - a[1]);
  const query = bucket ? new URLSearchParams({ start: bucket.start, end: bucket.end }).toString() : '';
  return <Dialog open={!!bucket} onOpenChange={open => !open && onClose()}>
    <DialogContent className="w-[calc(100%-2rem)] max-w-2xl max-h-[85dvh] overflow-y-auto rounded-2xl">
      <DialogHeader>
        <DialogTitle>{bucket?.label || bucket?.month}</DialogTitle>
        <DialogDescription>Recorded income and spending · {rows.length} transactions. Based on the same records as the chart; current periods may be incomplete.</DialogDescription>
      </DialogHeader>
      {bucket && <>
        <div className="flex justify-between gap-3">
          <button disabled={!onPrevious} onClick={onPrevious} className="min-h-[44px] rounded-lg border border-border px-3 text-sm font-medium disabled:opacity-40">← Previous period</button>
          <button disabled={!onNext} onClick={onNext} className="min-h-[44px] rounded-lg border border-border px-3 text-sm font-medium disabled:opacity-40">Next period →</button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 rounded-xl bg-secondary/60 p-3">
          {[['Income', bucket.income, 'text-emerald-600 dark:text-emerald-400'], ['Spending', bucket.expense, 'text-orange-600 dark:text-orange-400'], ['Net', bucket.net, 'text-foreground']].map(([label, value, color]) =>
            <div key={label} className="min-w-0 flex items-center justify-between gap-2 sm:block"><p className="text-xs text-muted-foreground">{label}</p><p className={`font-bold tabular-nums break-words text-sm sm:text-xl ${color}`}>{money(value)}</p></div>)}
        </div>
        <div>
          <h3 className="text-sm font-semibold mb-3">Where it went</h3>
          <div className="space-y-3">{categories.slice(0, 6).map(([name, amount]) => <div key={name}>
            <div className="flex justify-between gap-3 text-sm mb-1"><span className="capitalize">{name.replaceAll('_', ' ')}</span><span className="tabular-nums font-medium">{money(amount)} <span className="text-xs text-muted-foreground">· {bucket.expense > 0 ? Math.round(amount / bucket.expense * 100) : 0}%</span></span></div>
            <div className="h-2 bg-secondary rounded-full overflow-hidden"><div className="h-full rounded-full bg-orange-400" style={{ width: `${bucket.expense > 0 ? amount / bucket.expense * 100 : 0}%` }} /></div>
          </div>)}{!categories.length && <p className="text-sm text-muted-foreground">No recorded spending in this period.</p>}</div>
          <Link className="inline-flex min-h-[44px] items-center text-sm font-semibold text-primary mt-2" to={`/spending-summary?${query}`}>Explore all spending →</Link>
        </div>
        <div>
          <h3 className="text-sm font-semibold mb-2">Latest activity</h3>
          {rows.slice().sort((a,b) => b.date.localeCompare(a.date)).slice(0, 5).map((t,i) => <div key={t.id || i} className="flex justify-between gap-3 py-3 border-b border-border/60 text-sm">
            <div className="min-w-0"><p className="truncate font-medium">{t.title}</p><p className="text-xs text-muted-foreground mt-1">{t.date}</p></div>
            <span className={`shrink-0 tabular-nums ${t.type === 'income' ? 'text-emerald-600 dark:text-emerald-400' : ''}`}>{t.type === 'income' ? '+' : '−'}{money(t.amount)}</span>
          </div>)}
          <Link className="inline-flex min-h-[44px] items-center text-sm font-semibold text-primary mt-2" to={`/finance?${query}`}>View all transactions →</Link>
        </div>
      </>}
    </DialogContent>
  </Dialog>;
}
