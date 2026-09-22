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

// Call only after authentication, ownership and rate-limit checks succeed.
export async function beginBankSync(admin: Admin, account: { id: string; user_id: string; sync_status: string }): Promise<BankSyncContext> {
  if (account.sync_status === 'disconnected') throw new Error('Bank is disconnected');
  const { data, error } = await admin.from('connected_accounts')
    .update({ sync_status: 'syncing' }).eq('id', account.id)
    .eq('user_id', account.user_id).eq('sync_status', account.sync_status)
    .select('id').maybeSingle();
  if (error || !data) throw new Error('Could not mark sync in progress');
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
