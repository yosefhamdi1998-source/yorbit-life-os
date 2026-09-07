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
// keeps working. 20260907160000 blanks the old column once sync is verified,
// and this fallback should be deleted at the same time.
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
