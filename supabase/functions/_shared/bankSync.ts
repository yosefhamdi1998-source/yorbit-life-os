import { serviceClient } from './supabase.ts';

type Admin = ReturnType<typeof serviceClient>;
export type BankSyncContext = {
  admin: Admin;
  accountId: string;
  userId: string;
  startedAt: string;
  imported: number;
  skipped: number;
  failed: number;
};

// Thrown when a claim is refused specifically because another sync is
// genuinely in flight right now, as opposed to any other reason the claim
// could fail. Callers use this to tell "busy, try again shortly" apart from
// "something is actually broken" - both to the person who gets the message
// and, for sync-all-accounts, to avoid counting a live conflict as a failure.
export class SyncInProgressError extends Error {
  constructor() {
    super('This account is already syncing.');
    this.name = 'SyncInProgressError';
  }
}

// How long a row may sit at 'syncing' before a NEW claim is allowed to treat
// it as abandoned rather than genuinely in progress.
//
// Every worker that holds this status commits to leaving it - via
// completeBankSync or failBankSync - before its own request ends, and nothing
// else ever writes this column while it reads 'syncing' (both of those
// functions guard on `sync_status = 'syncing'`, and the disconnect path is
// itself guarded against clobbering an active sync - see completeBankSync).
// So a 'syncing' row can only still be sitting there because the process
// that claimed it died first: the Edge Function was killed, the connection
// to Plaid or Postgres dropped, the host recycled mid-request. There is no
// other way to leave this state without going through the two functions
// that always clear it.
//
// The window has to comfortably exceed the slowest realistic sync. The
// transaction insert loop in plaid-sync-transactions writes one row per
// network round trip rather than batching, so a large first-time backfill
// (the function itself asks for five years of history) can legitimately run
// for minutes, not seconds. 15 minutes is chosen to sit well clear of that
// and of the platform's own execution limit, which is shorter - reclaiming
// too early would let two writers interleave on the same sync; reclaiming
// too late only means a genuinely-abandoned row waits a little longer for
// the next click or cron tick to notice it is free again.
const STALE_SYNC_MINUTES = 15;

// Call only after authentication, ownership and rate-limit checks succeed.
//
// The `account` argument is a snapshot the caller already has - it is used
// only for the cheap, friendly-message fast path below. The actual claim is
// a single atomic UPDATE evaluated against the LIVE row, so it is correct
// even when that snapshot is stale (read moments ago, since changed by a
// disconnect, another sync starting, or a previous sync finishing).
export async function beginBankSync(admin: Admin, account: { id: string; user_id: string; sync_status: string }): Promise<BankSyncContext> {
  if (account.sync_status === 'disconnected') throw new Error('Bank is disconnected');

  const staleCutoff = new Date(Date.now() - STALE_SYNC_MINUTES * 60 * 1000).toISOString();

  // A row is claimable now unless it is disconnected, or it is 'syncing'
  // AND that claim is still fresh. Postgres evaluates this WHERE clause
  // once, atomically, per row - if two callers race, at most one UPDATE can
  // match and return a row; the loser's WHERE clause simply matches nothing,
  // with no lock contention or retry needed on either side.
  const { data, error } = await admin.from('connected_accounts')
    .update({ sync_status: 'syncing' })
    .eq('id', account.id)
    .eq('user_id', account.user_id)
    .neq('sync_status', 'disconnected')
    .or(`sync_status.neq.syncing,updated_date.lt.${staleCutoff}`)
    .select('id')
    .maybeSingle();

  if (error) throw new Error('Could not mark sync in progress');
  if (!data) {
    // The claim matched nothing. Find out why, from the live row rather
    // than the caller's snapshot, so the message is accurate even for a
    // status that changed after the caller last read it.
    const { data: current } = await admin.from('connected_accounts')
      .select('sync_status').eq('id', account.id).maybeSingle();
    if (current?.sync_status === 'syncing') throw new SyncInProgressError();
    if (current?.sync_status === 'disconnected') throw new Error('Bank is disconnected');
    throw new Error('Could not mark sync in progress');
  }
  return { admin, accountId: account.id, userId: account.user_id, startedAt: new Date().toISOString(), imported: 0, skipped: 0, failed: 0 };
}

export async function completeBankSync(context: BankSyncContext, fields: Record<string, unknown> = {}) {
  const { admin, accountId, userId } = context;
  const { data, error } = await admin.from('connected_accounts').update({
    ...fields, sync_status: 'connected', error_message: null, last_synced_at: new Date().toISOString(),
  }).eq('id', accountId).eq('user_id', userId).eq('sync_status', 'syncing').select('id').maybeSingle();
  // A disconnect while the request was running must never become a reconnect.
  if (error || !data) throw new Error('Could not confirm sync completion');
}

export async function logBankSync(context: BankSyncContext, status: string, message: string) {
  const { error } = await context.admin.from('bank_sync_logs').insert({
    user_id: context.userId, provider: 'plaid', connected_account_id: context.accountId,
    started_at: context.startedAt, finished_at: new Date().toISOString(), status,
    imported_count: context.imported, skipped_duplicate_count: context.skipped,
    error_count: context.failed, message,
  });
  if (error) console.error('Bank sync log could not be saved');
}

export async function failBankSync(context: BankSyncContext | null, error: unknown) {
  if (!context) return; // Never use an unauthenticated request id for cleanup.
  const code = (error as { response?: { data?: { error_code?: string } } })?.response?.data?.error_code;
  const reconnect = ['ITEM_LOGIN_REQUIRED', 'ITEM_LOCKED', 'PENDING_EXPIRATION', 'ACCESS_NOT_GRANTED', 'INVALID_ACCESS_TOKEN', 'ITEM_NOT_SUPPORTED'].includes(code || '');
  const { data, error: writeError } = await context.admin.from('connected_accounts').update({
    sync_status: reconnect ? 'reconnect_required' : 'error',
    error_message: reconnect
      ? 'Your bank needs you to sign in again to keep sharing data. Reconnect it from Bank Sync.'
      : "We couldn't finish syncing this account. Please try again in a few minutes.",
  }).eq('id', context.accountId).eq('user_id', context.userId).eq('sync_status', 'syncing').select('id').maybeSingle();
  if (writeError) console.error('Bank sync failure status could not be saved');
  if (data) {
    context.failed = Math.max(context.failed, 1);
    await logBankSync(context, context.imported > 0 ? 'partial' : 'error', reconnect ? 'Bank reconnection required' : 'Sync incomplete; retry required');
  }
}
