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
