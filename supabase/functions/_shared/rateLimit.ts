import { serviceClient } from './supabase.ts';
import { jsonResponse } from './cors.ts';

// Rate limiting for edge functions.
//
// Before this, ai-coach was the only function with any limit at all. Every
// other endpoint — bank sync, bill saving, checkout, account deletion —
// could be called as fast as a script could open sockets. That is fine
// when the users are four family members and untenable the moment the app
// is public.
//
// The counter lives in Postgres rather than in memory because edge
// functions are stateless and horizontally scaled: an in-process counter
// resets on every cold start and is per-instance, so it enforces nothing.

export type RateLimitRule = {
  // Requests permitted per window.
  limit: number;
  // Window length in seconds.
  windowSeconds: number;
};

// Defaults chosen to be invisible to a real person and obstructive to a
// script. A human tapping "sync" repeatedly might manage 5 in a minute;
// nobody legitimately calls it 60 times.
export const RULES = {
  ai: { limit: 20, windowSeconds: 3600 },            // AI is the expensive one
  sync: { limit: 10, windowSeconds: 3600 },          // Plaid calls cost money
  write: { limit: 120, windowSeconds: 60 },          // ordinary CRUD
  auth: { limit: 10, windowSeconds: 3600 },          // signup/checkout
  destructive: { limit: 5, windowSeconds: 3600 },    // account deletion
} satisfies Record<string, RateLimitRule>;

export type RateLimitResult = {
  allowed: boolean;
  count: number;
  resetsAt: string | null;
};

// `identity` should be a user id where one is known. Falling back to IP is
// deliberate but weak — it is shared behind NAT and trivially rotated — so
// it is only used on paths that have no authenticated user yet.
export function identityFromRequest(req: Request, userId?: string | null): string {
  if (userId) return `user:${userId}`;
  const fwd = req.headers.get('x-forwarded-for') || '';
  const ip = fwd.split(',')[0].trim() || 'unknown';
  return `ip:${ip}`;
}

export async function checkRateLimit(
  bucket: string,
  identity: string,
  rule: RateLimitRule,
): Promise<RateLimitResult> {
  const admin = serviceClient();
  const key = `${bucket}:${identity}`;

  const { data, error } = await admin.rpc('check_rate_limit', {
    p_key: key,
    p_limit: rule.limit,
    p_window_seconds: rule.windowSeconds,
  });

  if (error) {
    // Fail OPEN, deliberately. A rate limiter that takes the whole app
    // down when its own table is unreachable is a worse outage than the
    // abuse it prevents. The failure is logged so it is not silent.
    console.error('rate limit check failed, allowing request:', error.message);
    return { allowed: true, count: 0, resetsAt: null };
  }

  const row = Array.isArray(data) ? data[0] : data;
  return {
    allowed: row?.allowed ?? true,
    count: row?.current_count ?? 0,
    resetsAt: row?.resets_at ?? null,
  };
}

// Convenience wrapper: returns a ready-to-return 429 Response when the
// caller is over the limit, or null when the request should proceed.
// `req` is needed so the 429 carries the correct Access-Control-Allow-Origin
// for the caller. Without it the response falls back to the primary origin
// and a browser on the other allowed origin cannot read the error — it sees
// an opaque CORS failure instead of "you are being rate limited."
export async function enforceRateLimit(
  bucket: string,
  identity: string,
  rule: RateLimitRule,
  message = 'Too many requests. Please wait a moment and try again.',
  req?: Request,
): Promise<Response | null> {
  const result = await checkRateLimit(bucket, identity, rule);
  if (result.allowed) return null;

  const retryAfter = result.resetsAt
    ? Math.max(1, Math.ceil((new Date(result.resetsAt).getTime() - Date.now()) / 1000))
    : rule.windowSeconds;

  return jsonResponse(
    { error: message, retry_after_seconds: retryAfter },
    429,
    { 'Retry-After': String(retryAfter) },
    req,
  );
}
