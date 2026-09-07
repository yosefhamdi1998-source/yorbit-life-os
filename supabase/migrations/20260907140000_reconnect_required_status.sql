-- Distinguish "retry might work" from "the bank needs you to sign in again".
--
-- plaid-sync-transactions treated every failure identically: sync_status
-- 'error' and "We couldn't sync this account. Please try again." For a
-- transient network fault that is correct advice. For ITEM_LOGIN_REQUIRED it
-- is advice that can never work - the item stays broken however many times
-- the user taps retry, and the only fix is re-authenticating through Plaid
-- Link. Telling someone to retry something that cannot succeed is how a
-- recoverable problem becomes a silently dead bank connection.
--
-- The sync function now maps Plaid's error_code to this status. It must exist
-- in the CHECK constraint first: without this migration that write throws
-- 23514 from inside the error handler, so a failed sync would fail to record
-- that it failed, and sync_status would stay stuck on 'syncing' - which
-- sync-all-accounts skips, exactly the permanent-silence failure the handler
-- was written to prevent.

alter table connected_accounts
  drop constraint if exists connected_accounts_sync_status_check;

alter table connected_accounts
  add constraint connected_accounts_sync_status_check
  check (sync_status in (
    'not_connected',
    'connected',
    'syncing',
    'error',              -- transient; retry is worth offering
    'reconnect_required', -- terminal until the user re-authenticates
    'disconnected'
  ));

comment on column connected_accounts.sync_status is
  'not_connected | connected | syncing | error | reconnect_required | '
  'disconnected. `error` means a retry may succeed. `reconnect_required` '
  'means it cannot: Plaid returned ITEM_LOGIN_REQUIRED or similar and the '
  'user must re-link the institution.';
