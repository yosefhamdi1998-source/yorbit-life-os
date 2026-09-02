// Deterministic 0-100 financial health score from real numbers already in
// hand — no AI call, instant, works for every user including free tier.
// Weighted: savings rate (40) + spending trend vs. last period (25) +
// budget adherence (20) + bills paid on time (15).
function scoreFor({ income, expenses, prevExpenses, budgetedRows, overdueBillCount, hasBills }) {
  const savingsRate = income > 0 ? (income - expenses) / income : 0;
  const savingsPts = Math.max(0, Math.min(40, Math.round((savingsRate / 0.3) * 40)));

  let trendPts = 12; // neutral when there's no prior period to compare
  if (prevExpenses > 0) {
    const pctChange = ((expenses - prevExpenses) / prevExpenses) * 100;
    trendPts = Math.max(0, Math.min(25, Math.round(25 - pctChange / 2)));
  }

  let budgetPts = 15; // neutral when no budgets are set yet
  if (budgetedRows.length > 0) {
    const onTrack = budgetedRows.filter(r => r.spent <= r.limit).length;
    budgetPts = Math.round((onTrack / budgetedRows.length) * 20);
  }

  const billsPts = hasBills ? Math.max(0, 15 - overdueBillCount * 5) : 15;

  return Math.max(0, Math.min(100, savingsPts + trendPts + budgetPts + billsPts));
}

export function computeHealthScore({ heroIncome, heroExpenses, prevIncome, prevExpenses, prevTxCount = null, budgetedRows, bills }) {
  const overdueBillCount = bills.filter(b => !b.is_paid && b.due_date && new Date(b.due_date) < new Date()).length;
  const shared = { budgetedRows, overdueBillCount, hasBills: bills.length > 0 };

  const score = scoreFor({ income: heroIncome, expenses: heroExpenses, prevExpenses, ...shared });
  const prevScore = prevIncome > 0 || prevExpenses > 0
    ? scoreFor({ income: prevIncome, expenses: prevExpenses, prevExpenses: null, ...shared })
    : null;

  const delta = prevScore != null ? score - prevScore : null;

  // A previous period with very little data (e.g. "last year" covering only
  // a couple of weeks near a data-import boundary) produces a technically-
  // correct but wildly misleading percentage - dividing by a tiny prior
  // total inflates any real number into a triple-digit "spike." Cite a
  // specific % only when the comparison period has enough transactions to
  // mean something.
  const prevPeriodReliable = prevTxCount == null || prevTxCount >= 5;

  let explanation = "Add a few transactions to start building your score.";
  if (delta != null && Math.abs(delta) >= 1) {
    const expensePctChange = (prevExpenses > 0 && prevPeriodReliable) ? Math.round(((heroExpenses - prevExpenses) / prevExpenses) * 100) : null;
    if (delta > 0) {
      explanation = expensePctChange != null && expensePctChange < 0
        ? `Your score rose ${delta} point${delta === 1 ? '' : 's'} because you spent ${Math.abs(expensePctChange)}% less than last period.`
        : `Your score rose ${delta} point${delta === 1 ? '' : 's'} vs. last period.`;
    } else {
      explanation = expensePctChange != null && expensePctChange > 0
        ? `Your score dropped ${Math.abs(delta)} point${Math.abs(delta) === 1 ? '' : 's'} because you spent ${expensePctChange}% more than last period.`
        : `Your score dropped ${Math.abs(delta)} point${Math.abs(delta) === 1 ? '' : 's'} vs. last period.`;
    }
  } else if (delta != null) {
    explanation = "Holding steady vs. last period.";
  } else if (heroIncome > 0) {
    explanation = "Your first score for this period — check back next period to see it move.";
  }

  // Softer framing at the low end — this sits near the top of Home for a
  // lot of users, and "Room to improve" / "turn this around" read as a
  // scolding on first open rather than useful information. Same thresholds,
  // same score, just less judgmental language.
  const label = score >= 80 ? "You're doing great."
    : score >= 60 ? "You're doing okay."
    : score >= 40 ? "Building momentum."
    : "Let's build a plan.";

  return { score, delta, explanation, label };
}
