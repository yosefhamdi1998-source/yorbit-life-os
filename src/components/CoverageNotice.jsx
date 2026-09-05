import { Link } from 'react-router-dom';
import { Info, ArrowRight } from 'lucide-react';
import { assessCoverage, coverageMessage } from '@/lib/dataCoverage';

// Sits directly under a period total and says when that total is built from
// too little data to mean anything.
//
// Deliberately NOT an error style. Nothing is broken and nothing is wrong -
// the arithmetic is exact. What is missing is history, and the fix is an
// import, so this reads as information with a next step rather than as a
// failure. Rendering nothing when coverage is fine keeps it from becoming
// wallpaper people stop seeing.
export default function CoverageNotice({ transactions, periodStart, periodEnd, periodLabel, className = '' }) {
  if (!periodStart || !periodEnd) return null;
  const coverage = assessCoverage(transactions, periodStart, periodEnd);
  const message = coverageMessage(coverage, periodLabel);
  if (!message) return null;

  return (
    <div className={`rounded-xl bg-amber-500/10 border border-amber-500/20 px-3.5 py-3 ${className}`}>
      <div className="flex gap-2.5">
        <Info className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
        <div className="min-w-0">
          <p className="text-[13px] text-amber-800 dark:text-amber-300 leading-snug">
            {message}
          </p>
          <Link
            to="/csv-import"
            className="inline-flex items-center gap-1 text-[12px] font-bold text-amber-800 dark:text-amber-300 mt-1.5 hover:underline underline-offset-2"
          >
            Import more history <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      </div>
    </div>
  );
}
