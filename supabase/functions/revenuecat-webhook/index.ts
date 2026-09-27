import { jsonResponse, errorResponse } from '../_shared/cors.ts';
import { serviceClient } from '../_shared/supabase.ts';
import { sameSecret, eventUserIds, fetchSubscriber, appStoreState, applyAppStoreState } from '../_shared/revenuecat.ts';

// Point RevenueCat's webhook (Project settings > Integrations > Webhooks) at:
//   https://<PROJECT_REF>.supabase.co/functions/v1/revenuecat-webhook
// and set its Authorization header value; store the same value as
// REVENUECAT_WEBHOOK_AUTH. RevenueCat cannot send a Supabase JWT, so this
// function runs with verify_jwt = false and checks that header instead.
Deno.serve(async (req) => {
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405, {}, req);
  try {
    const expected = Deno.env.get('REVENUECAT_WEBHOOK_AUTH');
    const secretKey = Deno.env.get('REVENUECAT_SECRET_API_KEY');
    if (!expected || !secretKey) return jsonResponse({ error: 'App Store purchases are not enabled yet.' }, 501, {}, req);
    if (!sameSecret(req.headers.get('Authorization'), expected)) return jsonResponse({ error: 'Unauthorized' }, 401, {}, req);

    const body = await req.json().catch(() => null);
    const event = body?.event;
    if (!event || typeof event.type !== 'string') return jsonResponse({ error: 'Invalid event' }, 400, {}, req);
    if (event.type === 'TEST') return jsonResponse({ received: true }, 200, {}, req);

    // Every event type is handled the same way: re-read each affected user's
    // current state from RevenueCat and write that. Duplicates, retries and
    // out-of-order delivery therefore all converge on the same row.
    const candidates = eventUserIds(event);
    if (!candidates.length) return jsonResponse({ received: true, synced: 0 }, 200, {}, req);
    const admin = serviceClient();
    const { data: users, error } = await admin.from('profiles').select('id').in('id', candidates);
    if (error) throw error;
    for (const { id } of users || []) {
      const subscriber = await fetchSubscriber(id, secretKey);
      await applyAppStoreState(admin, id, appStoreState(subscriber));
    }
    return jsonResponse({ received: true, synced: (users || []).length }, 200, {}, req);
  } catch (err) {
    // Non-2xx makes RevenueCat retry (5, 10, 20, 40, 80 minutes).
    return errorResponse('Could not process the App Store event.', 500, { internal: err, fn: 'revenuecat-webhook', req });
  }
});
