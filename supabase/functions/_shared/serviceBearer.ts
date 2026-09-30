import { timingSafeEqual } from 'node:crypto';

// Existing internal callers use the legacy service JWT in Authorization.
// Missing configuration never grants system privileges.
export function isServiceBearer(header: string | null, key: string | undefined): boolean {
  if (!key || !key.trim() || !header) return false;
  const match = /^Bearer ([^\s]+)$/i.exec(header);
  if (!match) return false;
  const supplied = new TextEncoder().encode(match[1]);
  const expected = new TextEncoder().encode(key);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

// New-format project secret keys (sb_secret_...). Supabase injects them into
// Edge Functions as SUPABASE_SECRET_KEYS, a JSON dictionary keyed by key
// name. Its documented pattern for calling a function with a secret key is
// verify_jwt = false plus a check like this inside the function; while the
// gateway still requires a JWT, no secret key can reach this check.
export function isProjectSecretKey(header: string | null, keysJson: string | undefined): boolean {
  if (!header || !keysJson) return false;
  let keys: unknown;
  try { keys = JSON.parse(keysJson); } catch { return false; }
  if (!keys || typeof keys !== 'object' || Array.isArray(keys)) return false;
  return Object.values(keys as Record<string, unknown>)
    .some(key => typeof key === 'string' && /^sb_secret_[A-Za-z0-9_-]{16,}$/.test(key) && isServiceBearer(header, key));
}
