// Fetch a Plaid access token for a connected account.
//
// Tokens live in `plaid_credentials`, a table with RLS enabled and NO
// policies: no ordinary role can read a row from it, and service_role
// bypasses RLS. That is the entire access-control model, and it works
// regardless of who granted what on the older `connected_accounts` table -
// which matters, because two attempts to lock that column down with REVOKE
// failed against the live database (the privilege arrives from a grantor the
// running role cannot revoke).
//
// The fallback to connected_accounts.access_token_ref is TRANSITIONAL. During
// rollout both locations hold the token so a not-yet-redeployed function
// keeps working.
//
// It has no end date yet. This comment used to say the old column "is
// blanked by 20260907160000" — that id is net_worth_value_positive.sql,
// which constrains net_worth_entries.value and never touches Plaid. NO
// migration in the tree blanks the column, and plaid-exchange-token still
// writes a live token to it on every new link, so the transitional state
// grows rather than drains.
//
// Retiring it safely is a sequence, not an edit:
//   1. Make the vault write in plaid-exchange-token fatal instead of
//      logged-and-ignored — today it falls back to this column on failure,
//      so the column cannot be removed while that path exists.
//   2. Stop writing access_token_ref on new links.
//   3. Blank the column ONLY for rows with a matching plaid_credentials
//      row holding the same token.
//   4. Delete this fallback.
// scripts/audit-plaid-token-exposure.sql reports which rows are safe for
// step 3 and whether the column is still client-readable/writable.
//
// Must only ever be called with a service-role client.
export async function getPlaidAccessToken(
  admin: { from: (t: string) => any },
  connectedAccountId: string,
): Promise<{ token: string | null; source: 'vault' | 'legacy' | 'none' }> {
  const { data: cred } = await admin
    .from('plaid_credentials')
    .select('access_token')
    .eq('connected_account_id', connectedAccountId)
    .maybeSingle();

  if (cred?.access_token) return { token: cred.access_token, source: 'vault' };

  const { data: acct } = await admin
    .from('connected_accounts')
    .select('access_token_ref')
    .eq('id', connectedAccountId)
    .maybeSingle();

  if (acct?.access_token_ref) {
    // Self-healing: an account linked before the vault existed, or one whose
    // copy was missed, is migrated the first time it syncs rather than
    // waiting for a backfill nobody remembers to run.
    console.warn(`plaid token for ${connectedAccountId} came from the legacy column; copying to vault`);
    return { token: acct.access_token_ref, source: 'legacy' };
  }

  return { token: null, source: 'none' };
}
