// Which Plaid environment a request belongs to, and its credentials.
//
// Real users' connections are production. Listed test accounts may instead
// link Plaid Sandbox institutions (fake banks, public test logins), so bank
// linking, the native OAuth return, sync, disconnect and deletion can be
// verified end to end without anyone's real bank login.
//
// Plaid issues one client id for every environment and a separate secret per
// environment. Its tokens carry their environment in the prefix
// (access-sandbox-..., public-sandbox-...), so every call after linking routes
// by the token itself: no stored flag can disagree with the credential.
// Anything that is not a sandbox token keeps today's production behaviour.

export type PlaidEnvironment = 'production' | 'sandbox';

const PLAID_HOSTS: Record<PlaidEnvironment, string> = {
  production: 'https://production.plaid.com',
  sandbox: 'https://sandbox.plaid.com',
};

export function plaidEnvironmentOfToken(token: string | null | undefined): PlaidEnvironment {
  return /^(access|public)-sandbox-/.test(token ?? '') ? 'sandbox' : 'production';
}

export function plaidHost(environment: PlaidEnvironment): string {
  return PLAID_HOSTS[environment];
}

// { clientId, secret } for the environment, or null when it isn't configured.
// The sandbox never borrows the production secret (Plaid would reject it, and
// a misrouted call must fail rather than reach the other environment).
export function plaidCredentials(environment: PlaidEnvironment, get: (name: string) => string | undefined | null) {
  const clientId = get('PLAID_CLIENT_ID')?.trim();
  const secret = get(environment === 'sandbox' ? 'PLAID_SANDBOX_SECRET' : 'PLAID_SECRET')?.trim();
  return clientId && secret ? { clientId, secret } : null;
}

// Whether this user's NEW bank links go to Plaid Sandbox: the sandbox secret
// must exist and the user's address must be on PLAID_SANDBOX_EMAILS
// (comma-separated exact addresses or @domain suffixes). Unset = nobody.
export function sandboxLinkAllowed(email: string | null | undefined, get: (name: string) => string | undefined | null): boolean {
  if (!plaidCredentials('sandbox', get)) return false;
  const address = (email ?? '').trim().toLowerCase();
  if (!address.includes('@')) return false;
  return (get('PLAID_SANDBOX_EMAILS') ?? '').split(',').map(entry => entry.trim().toLowerCase()).filter(Boolean)
    .some(entry => entry.startsWith('@') ? address.endsWith(entry) : address === entry);
}
