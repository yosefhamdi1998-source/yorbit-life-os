import { getPlaidAccessToken } from './plaidToken.ts';
import { plaidCredentials, plaidEnvironmentOfToken } from './plaidEnvironment.ts';
import { Configuration, PlaidApi, PlaidEnvironments } from 'npm:plaid@29.0.0';

// Postgres "no_data_found", raised by claim/finalize_bank_disconnect for an
// account that does not exist or is not this user's (claim), or that is no
// longer being disconnected (finalize).
export const NOT_FOUND = 'P0002';

export type BankDisconnectResult =
  | { status: 'done'; revoked: boolean }
  | { status: 'not_found'; stage: 'claim' | 'finalize' }
  | { status: 'retry'; reason: 'claim' | 'credential_read' | 'plaid_not_configured' | 'provider' | 'finalize'; internal: unknown };

type Admin = { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: any; error: any }>; from: (t: string) => any };

// The one disconnect sequence, shared by the user's Disconnect button
// (plaid-disconnect-account) and the operator cleanup of accounts that were
// marked disconnected before that existed (retire-legacy-bank-credentials).
//
// 1. claim_bank_disconnect: ownership (p_user_id), a per-Item advisory lock,
//    the visible 'disconnecting' state, and a fresh "is a sibling still
//    connected?" answer (see migration 20260927212600).
// 2. Revoke the Item at Plaid, in the token's own environment, only when no
//    connected sibling still needs it. ITEM_NOT_FOUND means already removed.
// 3. finalize_bank_disconnect: delete this account's credential and mark it
//    disconnected in one transaction.
// Any failure stops before finalize, so the credential stays for a retry.
// Never logs or returns the token or any provider payload.
//
// revokedTokens lets one maintenance run skip a second removal call for an
// Item it has already removed; the user endpoint does not pass it.
export async function completeBankDisconnect(
  admin: Admin,
  userId: string,
  accountId: string,
  options: { env: (name: string) => string | undefined; revokedTokens?: Set<string> },
): Promise<BankDisconnectResult> {
  const { data, error: claimError } = await admin.rpc('claim_bank_disconnect', {
    p_user_id: userId, p_account_id: accountId,
  });
  if (claimError) {
    return claimError.code === NOT_FOUND ? { status: 'not_found', stage: 'claim' } : { status: 'retry', reason: 'claim', internal: claimError };
  }
  const claim = Array.isArray(data) ? data[0] : null;
  if (!claim) return { status: 'retry', reason: 'claim', internal: new Error('Disconnect claim returned no row') };

  let revoked = false;
  if (claim.account_provider === 'plaid') {
    let token: string | null;
    try {
      ({ token } = await getPlaidAccessToken(admin, accountId));
    } catch (err) {
      // A failed read is not "nothing to revoke".
      return { status: 'retry', reason: 'credential_read', internal: err };
    }
    if (token && !claim.sibling_active && !options.revokedTokens?.has(token)) {
      const environment = plaidEnvironmentOfToken(token);
      const credentials = plaidCredentials(environment, options.env);
      if (!credentials) return { status: 'retry', reason: 'plaid_not_configured', internal: new Error('Plaid is not configured') };
      const plaidClient = new PlaidApi(new Configuration({
        basePath: PlaidEnvironments[environment],
        baseOptions: { headers: { 'PLAID-CLIENT-ID': credentials.clientId, 'PLAID-SECRET': credentials.secret } },
      }));
      try {
        await plaidClient.itemRemove({ access_token: token });
        revoked = true;
      } catch (err) {
        // ITEM_NOT_FOUND: already removed, e.g. by an earlier attempt or a
        // sibling's own disconnect. Anything else leaves the credential in
        // place for the retry.
        if ((err as any)?.response?.data?.error_code !== 'ITEM_NOT_FOUND') return { status: 'retry', reason: 'provider', internal: err };
      }
      options.revokedTokens?.add(token);
    }
  }

  // Deletes this account's credential copy and marks it disconnected in one
  // transaction. When a sibling still needs the Item, only this copy goes;
  // the sibling keeps its own.
  const { error: finalizeError } = await admin.rpc('finalize_bank_disconnect', {
    p_user_id: userId, p_account_id: accountId,
  });
  if (finalizeError) {
    return finalizeError.code === NOT_FOUND ? { status: 'not_found', stage: 'finalize' } : { status: 'retry', reason: 'finalize', internal: finalizeError };
  }
  return { status: 'done', revoked };
}
