// Only these account fields may leave the bank connection endpoint.
// Keep credentials private even if the database later gains more columns.
export const PUBLIC_ACCOUNT_COLUMNS = 'id,user_id,provider,institution_name,account_name,account_type,account_mask,provider_account_id,provider_item_id,last_synced_at,sync_status,error_message,created_date,updated_date,history_start_date,history_backfilled_at,current_balance,available_balance,balance_limit,currency,balance_updated_at';
const publicFields = PUBLIC_ACCOUNT_COLUMNS.split(',');

export function publicConnectedAccount(account: Record<string, unknown>) {
  return Object.fromEntries(publicFields
    .filter((field) => Object.hasOwn(account, field))
    .map((field) => [field, account[field]]));
}
