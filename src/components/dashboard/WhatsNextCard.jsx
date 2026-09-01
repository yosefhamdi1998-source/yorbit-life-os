import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { Sparkles, ChevronRight } from 'lucide-react';
import { base44 } from '@/api/base44Client';

const TODAY = format(new Date(), 'yyyy-MM-dd');

// Reads today's already-generated Coach insight (Coach.jsx writes it once a
// day into ai_insight_caches) instead of making a second AI call from Home —
// this is a read of existing data, not a new AI surface. Falls back to a
// deterministic tip (no AI, no cost) when there's no cache yet, e.g. a
// brand new user who hasn't opened Coach today.
export default function WhatsNextCard({ overdueBillCount, heroNetSaved, fallbackTip }) {
  const [nextMove, setNextMove] = useState(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    base44.entities.AIInsightCache.filter({ type: 'coach', date: TODAY }, '-created_date', 1)
      .then(rows => {
        if (cancelled) return;
        const content = rows?.[0]?.content;
        if (content?.next_move) setNextMove(content.next_move);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setChecked(true); });
    return () => { cancelled = true; };
  }, []);

  if (!checked) return null;

  const tip = nextMove
    || (overdueBillCount > 0 ? `You have ${overdueBillCount} overdue bill${overdueBillCount === 1 ? '' : 's'} — pay ${overdueBillCount === 1 ? 'it' : 'them'} first.` : null)
    || (heroNetSaved < 0 ? "You spent more than you earned this period — Coach can help you build a plan." : null)
    || fallbackTip
    || "Add a few transactions and Coach will start giving you personalized moves.";

  return (
    <Link to="/coach" className="block mb-5">
      <div className="sky-card rounded-2xl p-4 lg:p-5 flex items-start gap-3 hover:border-primary/40 transition-colors">
        <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <Sparkles className="w-4 h-4 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">What should I do next?</p>
          <p className="text-sm font-semibold text-foreground leading-snug">{tip}</p>
        </div>
        <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 mt-1" />
      </div>
    </Link>
  );
}
