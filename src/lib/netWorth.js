// Net worth composition — what is live from a bank, what a person typed in.
//
// The Net Worth screen read net_worth_entries, a table nobody had ever
// filled, and displayed $0 after months of real use. Meanwhile every Plaid
// sync was receiving account balances and discarding them.
//
// Two rules this module exists to enforce:
//
//   1. Never call it "net worth" until it is one. Connected checking and
//      savings accounts are CASH ON HAND. Calling that net worth while
//      crypto, a car and a mortgage are missing is a confidently wrong
//      number on the screen a user trusts most.
//
//   2. Never let a hand-typed value look live. A car valued eight months
//      ago rendered next to a bank balance from four minutes ago, with
//      nothing distinguishing them, is the same class of quiet wrongness
//      as the savings rate that read +50% during a -42% month.

// A manual figure older than this is presented as needing a check. Ninety
// days is a quarter: long enough not to nag, short enough that a car or a
// property value has not silently drifted for a year.
export const STALE_AFTER_DAYS = 90;

export function daysSince(dateish) {
  if (!dateish) return null;
  const t = new Date(dateish).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((Date.now() - t) / 86400000);
}

export function isStale(dateish, limit = STALE_AFTER_DAYS) {
  const d = daysSince(dateish);
  return d !== null && d > limit;
}

// "today" / "3 days ago" / "4 months ago" — for a freshness badge, so the
// age is legible at a glance rather than being a raw timestamp.
export function freshnessLabel(dateish) {
  const d = daysSince(dateish);
  if (d === null) return 'never updated';
  if (d <= 0) return 'today';
  if (d === 1) return 'yesterday';
  if (d < 30) return `${d} days ago`;
  const m = Math.floor(d / 30);
  return m === 1 ? 'a month ago' : `${m} months ago`;
}

// Cash from connected accounts.
//
// A null balance means "never captured", which is NOT zero — an account
// connected before balances were stored, or a sync where Plaid omitted the
// payload. Counting those as $0 would understate cash and look like money
// disappeared, so they are reported separately and the caller says so.
export function summarizeCash(accounts = []) {
  const live = accounts.filter(
    a => a.sync_status !== 'disconnected' && a.current_balance !== null && a.current_balance !== undefined
  );
  const unknown = accounts.filter(
    a => a.sync_status !== 'disconnected' && (a.current_balance === null || a.current_balance === undefined)
  );

  // Credit lines carry a positive `current_balance` meaning money OWED.
  // Adding that to cash would inflate net worth by exactly the amount of
  // the debt — the sign error that makes a finance app worthless.
  const isDebt = a => a.account_type === 'credit' || a.account_type === 'loan';

  const cash = live.filter(a => !isDebt(a)).reduce((s, a) => s + Number(a.current_balance || 0), 0);
  const debt = live.filter(isDebt).reduce((s, a) => s + Number(a.current_balance || 0), 0);

  const oldest = live.reduce((acc, a) => {
    const t = a.balance_updated_at ? new Date(a.balance_updated_at).getTime() : null;
    return t && (acc === null || t < acc) ? t : acc;
  }, null);

  return {
    cash,
    debt,
    net: cash - debt,
    liveCount: live.length,
    unknownCount: unknown.length,
    unknownNames: unknown.map(a => a.account_name),
    updatedAt: oldest ? new Date(oldest).toISOString() : null,
  };
}

export function summarizeManual(entries = []) {
  const assets = entries.filter(e => e.type === 'asset');
  const liabilities = entries.filter(e => e.type === 'liability');
  const sum = rows => rows.reduce((s, e) => s + Number(e.value || 0), 0);
  const stale = entries.filter(e => isStale(e.value_updated_at || e.updated_date || e.created_date));
  return {
    assets: sum(assets),
    liabilities: sum(liabilities),
    net: sum(assets) - sum(liabilities),
    count: entries.length,
    staleCount: stale.length,
    staleNames: stale.map(e => e.name),
  };
}

// The headline figure and — just as important — what to CALL it.
//
// With only connected depository accounts this is cash on hand and says so.
// It becomes "net worth" only once the user has added something beyond the
// bank, because that is the point at which the phrase stops being a lie.
export function composeNetWorth(accounts = [], entries = []) {
  const cash = summarizeCash(accounts);
  const manual = summarizeManual(entries);
  const hasManual = manual.count > 0;

  return {
    cash,
    manual,
    total: cash.net + manual.net,
    // The honesty switch.
    label: hasManual ? 'Net Worth' : 'Cash on Hand',
    sublabel: hasManual
      ? `${cash.liveCount} connected account${cash.liveCount === 1 ? '' : 's'} + ${manual.count} manual entr${manual.count === 1 ? 'y' : 'ies'}`
      : `from ${cash.liveCount} connected account${cash.liveCount === 1 ? '' : 's'}`,
    isCompleteNetWorth: hasManual,
  };
}
