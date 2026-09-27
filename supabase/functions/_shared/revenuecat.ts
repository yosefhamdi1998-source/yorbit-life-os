import { timingSafeEqual } from 'node:crypto';

// Server-side App Store entitlements. Everything here is derived from
// RevenueCat's CURRENT customer info (GET /v1/subscribers), never from a
// webhook's own payload or anything the client sends: RevenueCat retries and
// can duplicate events, and recommends re-reading the subscriber after each.

export const RC_ENTITLEMENT = 'pro';
const PRODUCT_TO_PLAN: Record<string, string> = {
  'app.yorbit.pro.monthly': 'pro_monthly',
  'app.yorbit.pro.yearly': 'pro_yearly',
};
// The app configures RevenueCat with the Supabase user id (src/lib/revenuecat.js),
// so only UUIDs can be Yorbit users; RevenueCat anonymous ids never are.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function sameSecret(supplied: string | null, expected: string | undefined): boolean {
  if (!expected || !expected.trim() || !supplied) return false;
  const a = new TextEncoder().encode(supplied);
  const b = new TextEncoder().encode(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Every Yorbit user a webhook event could concern: the purchaser under any of
// its ids and, for a TRANSFER, both the old and the new owner.
export function eventUserIds(event: Record<string, unknown>): string[] {
  const list = (v: unknown) => (Array.isArray(v) ? v : []);
  const ids = [event.app_user_id, event.original_app_user_id, ...list(event.aliases),
    ...list(event.transferred_from), ...list(event.transferred_to)];
  return [...new Set(ids.filter((id): id is string => typeof id === 'string' && UUID.test(id)).map(id => id.toLowerCase()))];
}

export async function fetchSubscriber(appUserId: string, secretKey: string) {
  const res = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(appUserId)}`, {
    headers: { Authorization: `Bearer ${secretKey}`, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`RevenueCat subscriber lookup failed (${res.status})`);
  const body = await res.json();
  if (!body?.subscriber || typeof body.subscriber !== 'object') throw new Error('RevenueCat returned no subscriber');
  return body.subscriber;
}

function time(value: unknown, field: string): number | null {
  if (value === null || value === undefined) return null;
  const t = typeof value === 'string' ? Date.parse(value) : NaN;
  // An unreadable date must not be guessed into access either way.
  if (!Number.isFinite(t)) throw new Error(`RevenueCat ${field} is not a date`);
  return t;
}

// The App Store row implied by RevenueCat's current customer info. Access
// follows the entitlement: active while unexpired or inside Apple's billing
// grace period; gone once expired or refunded.
export function appStoreState(subscriber: any, now = Date.now()) {
  const ent = subscriber?.entitlements?.[RC_ENTITLEMENT] ?? null;
  const product = typeof ent?.product_identifier === 'string' ? ent.product_identifier : null;
  const sub = product ? subscriber?.subscriptions?.[product] ?? null : null;
  const expires = ent ? time(ent.expires_date, 'expires_date') : null;
  const grace = ent ? time(ent.grace_period_expires_date, 'grace_period_expires_date') : null;
  const refunded = sub ? time(sub.refunded_at, 'refunded_at') : null;
  const entitled = !!ent && refunded === null && (expires === null || expires > now || (grace !== null && grace > now));
  return {
    entitled,
    fields: {
      plan: entitled ? (PRODUCT_TO_PLAN[product ?? ''] ?? 'pro_monthly') : 'free',
      status: entitled ? (sub?.period_type === 'trial' ? 'trialing' : 'active') : 'canceled',
      current_period_end: expires === null ? null : new Date(expires).toISOString(),
      cancel_at_period_end: entitled && !!sub?.unsubscribe_detected_at,
      store_product_id: product,
      store_environment: sub ? (sub.is_sandbox ? 'sandbox' : 'production') : null,
    },
  };
}

// Writes the user's single App Store row. Inserts only when the user is
// entitled (someone who never bought has nothing to record); always updates
// an existing row, so expiry, refund or transfer away removes access.
export async function applyAppStoreState(admin: any, userId: string, state: ReturnType<typeof appStoreState>) {
  const find = () => admin.from('subscriptions').select('id').eq('user_id', userId).eq('provider', 'app_store');
  let existing = await find();
  if (existing.error) throw existing.error;
  let id = existing.data?.[0]?.id;
  if (!id) {
    if (!state.entitled) return;
    const inserted = await admin.from('subscriptions').insert({ ...state.fields, user_id: userId, provider: 'app_store' });
    if (!inserted.error) return;
    // A concurrent delivery for the same user inserted first (unique index):
    // update the row that won instead of failing.
    if (inserted.error.code !== '23505') throw inserted.error;
    existing = await find();
    if (existing.error) throw existing.error;
    id = existing.data?.[0]?.id;
    if (!id) throw new Error('App Store subscription row not found after a concurrent insert');
  }
  const { error } = await admin.from('subscriptions').update(state.fields).eq('id', id);
  if (error) throw error;
}
